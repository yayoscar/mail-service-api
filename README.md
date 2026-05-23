# Mail Service API

Servicio centralizado de envío de correos institucionales para la DGETI, integrado con Microsoft Graph API.

## Descripción

Mail Service API es un gateway de envío de correos donde cada sistema institucional se autentica con su propia API Key y solo puede enviar correos desde los buzones previamente autorizados. Los envíos se procesan de forma asíncrona mediante colas (BullMQ + Redis), con reintentos automáticos, soporte para archivos adjuntos y auditoría completa.

## Stack Tecnológico

| Componente | Tecnología |
|-----------|-----------|
| Framework | NestJS (TypeScript, strict mode) |
| Base de datos | PostgreSQL 16 con Prisma ORM |
| Cola | BullMQ + Redis 7 |
| Proveedor email | Microsoft Graph API v1.0 |
| Validación | class-validator + class-transformer |
| Upload | Multer (multipart/form-data) |
| Documentación | Swagger/OpenAPI |
| Contenedores | Podman Compose |

## Prerrequisitos

- Node.js 20+
- Podman + podman-compose
- Cuenta de Azure AD con App Registration (permiso delegado Mail.Send)

## Instalación

```bash
git clone <repo-url>
cd correos
npm install
```

## Configuración

1. Copiar el archivo de ejemplo:
```bash
cp .env.example .env
```

2. Editar `.env` con los valores reales:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `REDIS_HOST` | Host de Redis |
| `REDIS_PORT` | Puerto de Redis |
| `AZURE_TENANT_ID` | Tenant ID de Azure AD |
| `AZURE_CLIENT_ID` | Client ID del App Registration |
| `AZURE_CLIENT_SECRET` | Client secret del App Registration |
| `REDIRECT_URI` | URI de callback OAuth2 (default: `http://localhost:3002/auth/callback`) |
| `ADMIN_API_KEY` | Clave para endpoints administrativos |
| `PORT` | Puerto de la API (default: 3002) |
| `UPLOAD_DIR` | Directorio temporal para adjuntos (default: `./uploads`) |
| `MAX_ATTACHMENT_SIZE` | Tamaño máximo por archivo en bytes (default: 25MB) |

## Levantar Servicios

```bash
podman compose up -d
```

Verificar que los contenedores estén corriendo:
```bash
podman ps
```

## Migraciones

```bash
npx prisma migrate dev
```

## Ejecutar la API

```bash
# Modo desarrollo
npm run start:dev

# Modo producción
npm run start:prod
```

## Documentación Swagger

Disponible en: `http://localhost:3002/docs`

## Ejemplo de Uso Completo

### 1. Crear un sistema (requiere Admin API Key)

```bash
curl -X POST http://localhost:3002/systems \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: admin-dev-key-change-in-production" \
  -d '{"key": "control-gestion", "name": "Control de Gestión"}'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "key": "control-gestion",
    "name": "Control de Gestión",
    "active": true,
    "apiKey": "sk-xxxx...",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Importante:** Guarda la `apiKey`, solo se muestra una vez.

### 2. Agregar un buzón autorizado

```bash
curl -X POST http://localhost:3002/systems/{systemId}/mailboxes \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: admin-dev-key-change-in-production" \
  -d '{"email": "controlgestion@dgeti.gob.mx", "displayName": "Control de Gestión", "isDefault": true}'
```

### 3. Autorizar el buzón (OAuth2 Consent Flow)

Cada buzón debe autorizarse individualmente mediante el flujo de consentimiento OAuth2. Abre en el navegador:

```
http://localhost:3002/auth/consent?mailboxId={mailboxId}
```

Esto redirigirá a Microsoft para que el usuario inicie sesión y conceda permiso delegado de `Mail.Send`. Al completarse, los tokens se almacenan automáticamente y se refrescan cuando expiran.

### 4. Enviar un correo con adjuntos

```bash
curl -X POST http://localhost:3002/emails/send \
  -H "x-api-key: sk-xxxx..." \
  -F "from=controlgestion@dgeti.gob.mx" \
  -F 'to=["usuario@correo.com"]' \
  -F "subject=Bienvenida" \
  -F "html=<h1>Hola</h1><p>Bienvenido al sistema</p>" \
  -F "attachments=@/path/to/documento.pdf"
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "message": "Correo encolado correctamente",
    "emailLogId": "uuid",
    "status": "QUEUED"
  }
}
```

### 5. Consultar logs de auditoría

```bash
curl "http://localhost:3002/audit/email-logs?page=1&limit=20" \
  -H "x-admin-api-key: admin-dev-key-change-in-production"
```

## Integración con Microsoft Graph

### Modelo de permisos delegados

Esta API utiliza **permisos delegados** de Microsoft Graph. Cada buzón debe completar un flujo de consentimiento OAuth2 individual donde el usuario propietario del buzón autoriza el envío de correos en su nombre. Los tokens de acceso y refresco se almacenan de forma segura en la base de datos y se renuevan automáticamente.

### Pasos para configurar Azure AD

1. Ir a **Azure Portal > Azure Active Directory > App registrations**
2. Crear un nuevo registro de aplicación
3. En **Authentication**, agregar la **Redirect URI** (ej: `http://localhost:3002/auth/callback`)
4. En **API Permissions**, agregar **Microsoft Graph > Delegated Permissions > Mail.Send** y **offline_access**
5. Si el tenant tiene consentimiento de usuario deshabilitado, un administrador debe conceder **admin consent**
6. En **Certificates & secrets**, crear un nuevo client secret
7. Usar el **Tenant ID**, **Client ID** y **Client Secret** en el `.env`

### Flujo de consentimiento

1. Crear el buzón mediante el API administrativo
2. Abrir `GET /auth/consent?mailboxId={id}` en el navegador
3. Iniciar sesión con la cuenta del buzón en Microsoft
4. Aceptar los permisos solicitados (`Mail.Send` + `offline_access`)
5. Los tokens se almacenan automáticamente; el buzón queda listo para enviar correos

Si el tenant bloquea el consentimiento de usuario, la API mostrará un error claro indicando que se requiere aprobación administrativa.

### Notas de Seguridad

- `Mail.Send` como permiso delegado solo permite enviar en nombre del usuario que autorizó
- Esta API actúa como capa de gobernabilidad: cada sistema solo puede enviar desde sus buzones autorizados
- Las API Keys se almacenan como hash (bcrypt), nunca en texto plano
- Los tokens OAuth2 se almacenan en la base de datos con renovación automática (margen de 5 minutos)
- Los archivos adjuntos se eliminan automáticamente después del envío
- No se almacenan secrets ni tokens en el código fuente
- El diseño permite migrar a Application Permission + Client Credentials Flow si un administrador concede permisos en el futuro

## Estructura del Proyecto

```
src/
  main.ts
  app.module.ts
  config/
    prisma.service.ts
    prisma.module.ts
    config.module.ts
    multer.config.ts
  common/
    guards/          # ApiKeyGuard, AdminGuard
    decorators/      # @RequireApiKey(), @RequireAdmin()
    filters/         # Global exception filter
    interceptors/    # Response transform interceptor
  modules/
    systems/         # CRUD de sistemas
    mailboxes/       # CRUD de buzones
    auth/            # OAuth2 consent flow (delegated permissions)
    emails/          # Endpoint de envío
    graph/           # Integración Microsoft Graph
    queue/           # BullMQ processor
    audit/           # Consulta de EmailLog
```

## Licencia

MIT
