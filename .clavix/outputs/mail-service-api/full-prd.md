# Product Requirements Document: Mail Service API

## Problem & Goal

**Problem:** Múltiples sistemas institucionales de la DGETI necesitan enviar correos electrónicos a través de Microsoft Graph, pero actualmente no existe un mecanismo centralizado que controle qué buzones puede usar cada sistema. Sin esta capa de autorización, cualquier sistema podría suplantar cualquier remitente, lo que representa un riesgo de seguridad y gobernabilidad.

**Goal:** Construir una API centralizada llamada **mail-service-api** que actúe como gateway de envío de correos institucional. Cada sistema consumidor se autentica con su propia API Key y solo puede enviar correos desde los buzones previamente autorizados. El envío se procesa de forma asíncrona mediante colas (BullMQ + Redis) para no bloquear las peticiones HTTP, con reintentos automáticos, logging completo de auditoría y soporte para archivos adjuntos. Cada sistema envía su propio cuerpo HTML y adjuntos directamente — no hay plantillas del lado del servicio.

## Requirements

### Must-Have Features

1. **Gestión de Sistemas (CRUD)**
   - Crear, listar y actualizar sistemas consumidores
   - Cada sistema tiene un `key` único (ej: `control-gestion`, `sigoe`)
   - Generación y regeneración de API Keys (almacenadas como hash, nunca en texto plano)
   - Activación/desactivación de sistemas

2. **Gestión de Buzones Autorizados**
   - Asociar buzones de correo a un sistema específico
   - Cada buzón tiene: email, displayName, isDefault, active
   - Un sistema puede tener múltiples buzones, exactamente uno marcado como default
   - El campo `from` en el envío se valida contra los buzones activos del sistema
   - Si no se especifica `from`, se usa el buzón default

3. **Envío de Correos con Adjuntos por Cola**
   - Endpoint `POST /emails/send` autenticado con API Key (`x-api-key`)
   - Recibe `multipart/form-data` con campos JSON (from, to, cc, bcc, subject, html) + archivos adjuntos
   - Valida sistema, buzón autorizado, destinatarios y contenido
   - No envía directamente: crea EmailLog en estado QUEUED y publica job en BullMQ
   - Respuesta inmediata con `emailLogId` y status `QUEUED`
   - Soporta `to`, `cc`, `bcc` (múltiples destinatarios)
   - Soporta archivos adjuntos (multipart/form-data)
   - El cuerpo HTML y subject son obligatorios, enviados directamente por el sistema consumidor

4. **Worker de Procesamiento (BullMQ)**
   - Processor dedicado para la cola `email-send`
   - Obtiene access token de Microsoft Graph (Client Credentials Flow)
   - Envía via `POST https://graph.microsoft.com/v1.0/users/{from}/sendMail`
   - Caché de token hasta antes de expirar (evitar pedir token en cada envío)
   - Incluye archivos adjuntos como FileAttachment (base64) en el body de Graph
   - Reintentos automáticos con backoff exponencial ante 429 (throttling) o 5xx
   - Respeta header `Retry-After` cuando Graph lo provee
   - Actualiza EmailLog: attempts, status (SENT/FAILED/RETRYING), providerResponse, errorMessage

5. **Auditoría Completa (EmailLog)**
   - Registro de cada intento con: sistema, buzón, destinatarios, subject, cuerpo, adjuntos, status, errores
   - Estados: PENDING → QUEUED → SENT | FAILED | RETRYING
   - Proveedor siempre registrado como `MICROSOFT_GRAPH`
   - Timestamps de creación, actualización y envío efectivo
   - Nombres y tamaño de adjuntos registrados (no el contenido completo en log)

### Technical Requirements

#### Stack

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Framework | NestJS | Última estable |
| Lenguaje | TypeScript | Strict mode |
| Base de datos | PostgreSQL | 16 |
| ORM | Prisma | Última estable |
| Cola/Mensajería | BullMQ + Redis | Redis 7 |
| Proveedor email | Microsoft Graph API | v1.0 |
| Documentación | Swagger/OpenAPI | NestJS Swagger |
| Validación | class-validator + class-transformer | - |
| Upload archivos | Multer (multipart/form-data) | - |
| Contenedores | Podman Compose | - |

#### Autenticación Microsoft Graph

- **Flow:** Client Credentials (Application Permission, NO delegated)
- **Permiso requerido:** `Mail.Send` (Application)
- **Endpoint token:** `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`
- **Scope:** `https://graph.microsoft.com/.default`
- **Endpoint envío:** `https://graph.microsoft.com/v1.0/users/{from}/sendMail`
- **Token caching:** Almacenar en memoria hasta expiración (restar margen de seguridad)

#### Estructura de Proyecto

```
src/
  app.module.ts
  main.ts
  config/
  common/
    guards/          # ApiKeyGuard, AdminGuard
    decorators/      # @ApiKey(), @RequireAdmin()
    filters/         # Global exception filter
    interceptors/    # Response transform interceptor
  modules/
    auth/            # Validación de API Key
    systems/         # CRUD de sistemas
    mailboxes/       # CRUD de buzones (nested bajo systems)
    emails/          # Endpoint de envío
    graph/           # Integración Microsoft Graph
    queue/           # BullMQ module + processor
    audit/           # Consulta de EmailLog
```

#### Entidades Prisma

- **System**: id, key (unique), name, apiKeyHash, active, timestamps
- **Mailbox**: id, systemId (FK), email, displayName, isDefault, active, timestamps
- **EmailLog**: id, systemId, mailboxId, from, to (JSON), cc (JSON, optional), bcc (JSON, optional), subject, htmlBody, attachments (JSON - nombres y metadata, NO el contenido), status (enum EmailStatus), provider, providerResponse, errorMessage, attempts, sentAt, timestamps

#### Almacenamiento de Adjuntos

- Los archivos se reciben via `multipart/form-data`
- Se almacenan temporalmente en disco (directorio configurable via `UPLOAD_DIR`) durante el procesamiento de la cola
- Se eliminan automáticamente después del envío exitoso o fallo definitivo
- Se convierten a base64 para incluirlos como `FileAttachment` en el body de Microsoft Graph
- Límite configurable de tamaño total por petición (default: 25MB, límite de Graph)
- Metadata de adjuntos (nombre, tipo MIME, tamaño) se guarda en `attachments` (JSON) del EmailLog

#### Variables de Entorno

```
DATABASE_URL=          # PostgreSQL connection string
REDIS_HOST=            # Redis host
REDIS_PORT=            # Redis port
AZURE_TENANT_ID=       # Azure AD tenant
AZURE_CLIENT_ID=       # App registration client ID
AZURE_CLIENT_SECRET=   # App registration secret
GRAPH_SCOPE=           # https://graph.microsoft.com/.default
ADMIN_API_KEY=         # Key para endpoints administrativos
PORT=                  # Puerto de la API (default 3000)
UPLOAD_DIR=            # Directorio temporal para adjuntos (default ./uploads)
MAX_ATTACHMENT_SIZE=   # Tamaño máximo por archivo en bytes (default 25MB)
```

### Security Requirements

- API Keys almacenadas como hash (bcrypt o argon2), nunca en texto plano
- La API Key generada se muestra UNA VEZ al crear/regenerar sistema
- Endpoint `/emails/send` requiere header `x-api-key`
- Endpoints administrativos (CRUD sistemas, buzones) protegidos con `ADMIN_API_KEY`
- Validación estricta de todos los DTOs con class-validator
- Sanitización de direcciones de correo
- Validación de buzón autorizado por sistema (403 si no corresponde)
- No imprimir secretos, tokens ni API Keys en logs
- Principio de menor privilegio en Azure (solo Mail.Send Application)
- Validación de tipos MIME permitidos para adjuntos
- Límite de tamaño de archivos adjuntos

### API Endpoints

#### Sistemas (protegidos con ADMIN_API_KEY)
- `POST /systems` — Crear sistema, genera API Key
- `GET /systems` — Listar sistemas
- `PATCH /systems/:id` — Actualizar sistema
- `POST /systems/:id/regenerate-api-key` — Regenerar API Key

#### Mailboxes (protegidos con ADMIN_API_KEY)
- `POST /systems/:systemId/mailboxes` — Agregar buzón
- `GET /systems/:systemId/mailboxes` — Listar buzones del sistema
- `PATCH /mailboxes/:id` — Actualizar buzón
- `DELETE /mailboxes/:id` — Desactivar buzón (soft delete)
- `PATCH /mailboxes/:id/default` — Marcar como default

#### Emails (protegido con API Key del sistema)
- `POST /emails/send` — Encolar envío de correo con adjuntos

#### Payload de Envío (multipart/form-data)

Campos del formulario:
- `from` (string, opcional) — Email del remitente. Si no se envía, usa el buzón default del sistema.
- `to` (string, JSON array) — Lista de destinatarios. Obligatorio, al menos uno.
- `cc` (string, JSON array, opcional) — Copia
- `bcc` (string, JSON array, opcional) — Copia oculta
- `subject` (string) — Asunto del correo. Obligatorio.
- `html` (string) — Cuerpo HTML del correo. Obligatorio.
- `attachments` (files) — Archivos adjuntos. Múltiples archivos permitidos.

Ejemplo (curl):
```bash
curl -X POST http://localhost:3002/emails/send \
  -H "x-api-key: sk-xxx..." \
  -F "from=controlgestion@dgeti.gob.mx" \
  -F 'to=["usuario@correo.com"]' \
  -F "subject=Bienvenida" \
  -F "html=<h1>Hola</h1><p>Bienvenido al sistema</p>" \
  -F "attachments=@/path/to/documento.pdf" \
  -F "attachments=@/path/to/imagen.png"
```

#### Respuesta de Envío

```json
{
  "message": "Correo encolado correctamente",
  "emailLogId": "uuid",
  "status": "QUEUED"
}
```

#### Body de Microsoft Graph con Adjuntos

```json
{
  "message": {
    "subject": "...",
    "body": {
      "contentType": "HTML",
      "content": "..."
    },
    "toRecipients": [
      { "emailAddress": { "address": "..." } }
    ],
    "ccRecipients": [...],
    "bccRecipients": [...],
    "attachments": [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        "name": "documento.pdf",
        "contentType": "application/pdf",
        "contentBytes": "base64-encoded-content"
      }
    ]
  },
  "saveToSentItems": true
}
```

## Architecture & Design

### Patrones

- **Module-based architecture** (NestJS modules)
- **Guard pattern** para autenticación (ApiKeyGuard, AdminGuard)
- **Processor pattern** para el worker de BullMQ
- **Service layer** para lógica de negocio
- **DTO pattern** con class-validator para validación de entrada

### Flujo de Envío

```
Cliente → POST /emails/send (multipart/form-data + x-api-key)
  → Multer parsea archivos a UPLOAD_DIR temporal
  → ApiKeyGuard valida key contra hash en BD
  → EmailService valida buzón autorizado
  → Lee archivos adjuntos y guarda metadata en attachments (JSON)
  → Crea EmailLog (status: QUEUED)
  → Publica job en BullMQ (cola: email-send) con paths de archivos
  → Retorna { emailLogId, status: QUEUED }

Worker (BullMQ processor) recoge job:
  → Lee EmailLog
  → Lee archivos temporales de UPLOAD_DIR
  → Convierte adjuntos a base64
  → GraphMailService.getAccessToken() (cached)
  → GraphMailService.sendMail() → POST Graph API con attachments
  → Si éxito: EmailLog → SENT, elimina archivos temporales
  → Si 429/5xx: retry con backoff exponencial
  → Si fallo definitivo: EmailLog → FAILED, elimina archivos temporales
```

### Contenedores (Podman Compose)

- `postgres:16` — Base de datos
- `redis:7` — Cola/mensajería
- Comando: `podman compose up -d` (NO Docker)

## Out of Scope

1. **Interfaz de usuario / Dashboard** — Solo API REST, sin frontend
2. **Autenticación de usuarios finales** — No hay login/logout; solo API Keys de sistema
3. **Recepción de correos** — Solo envío outbound, sin inbox o webhooks de lectura
4. **Plantillas de correo** — Los sistemas envían su propio HTML; el servicio no gestiona plantillas
5. **Múltiples proveedores de email** — Solo Microsoft Graph (no SendGrid, SES, etc.)
6. **Webhooks/callbacks de estado** — El cliente consulta el log directamente
7. **Rate limiting por sistema** — Sin cuotas de envío definidas en la v1
8. **Multi-tenant con BD separadas** — Una sola base de datos PostgreSQL
9. **Respaldos automáticos de BD** — Operación manual del administrador
10. **Internacionalización (i18n)** — Mensajes de error y respuestas en español fijo
11. **Almacenamiento permanente de adjuntos** — Los archivos se eliminan tras el envío
12. **Validación de contenido de archivos** — No se escanea contenido por malware en la v1

## Additional Context

### Integración con Azure / Microsoft Graph

1. Registrar una aplicación en Azure AD (Entra ID)
2. Asignar permiso **Application: Mail.Send**
3. Un administrador debe conceder consentimiento (admin consent)
4. Los buzones autorizados deben existir como usuarios o recursos en el tenant
5. El App Registration se configura con `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`

### Notas de Seguridad (Mail.Send Application Permission)

- `Mail.Send` como Application Permission permite enviar como CUALQUIER usuario del tenant
- Por eso es crítico que la API valide estrictamente que cada sistema solo envía desde sus buzones autorizados
- La API actúa como capa de control y gobernabilidad sobre el permiso amplio de Graph
- Nunca exponer el client secret ni los tokens de acceso

### Entorno de Desarrollo

- Podman Compose para PostgreSQL 16 y Redis 7
- Comando: `podman compose up -d`
- Migraciones: `npx prisma migrate dev`
- Documentación Swagger: `http://localhost:3002/docs`
- El README debe documentar TODO usando Podman, no Docker

## Refinement History

### 2026-05-23

**Changes:**
- [REMOVED] Módulo de Plantillas (EmailTemplate) — Los sistemas envían su propio HTML directamente
- [REMOVED] Entidad EmailTemplate del schema Prisma
- [REMOVED] Endpoints CRUD de plantillas (POST/GET/PATCH/DELETE /templates)
- [REMOVED] Handlebars como dependencia
- [REMOVED] Campos templateKey y data del payload de envío
- [ADDED] Soporte para archivos adjuntos via multipart/form-data (Multer)
- [ADDED] Almacenamiento temporal de adjuntos con limpieza automática post-envío
- [ADDED] Conversión de adjuntos a base64 para FileAttachment de Graph API
- [ADDED] Variables UPLOAD_DIR y MAX_ATTACHMENT_SIZE
- [MODIFIED] Campo html y subject ahora son obligatorios (antes opcionales si había template)
- [MODIFIED] Payload de /emails/send ahora es multipart/form-data en vez de JSON puro
- [MODIFIED] Body de Microsoft Graph ahora incluye attachments array con FileAttachment
- [MODIFIED] EmailLog: agregado campo attachments (JSON), eliminada referencia a template
- [MODIFIED] Out of scope: agregado "Plantillas de correo" y "Almacenamiento permanente de adjuntos"

**Why:** Los sistemas consumidores ya generan su propio contenido HTML con sus propias herramientas. Centralizar plantillas añadía complejidad innecesaria. Se priorizó soporte para archivos adjuntos que es un requerimiento real.

---

*Generated with Clavix Planning Mode*
*Generated: 2026-05-23T00:00:00Z*
*Last refined: 2026-05-23*
