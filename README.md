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
git clone https://github.com/yayoscar/mail-service-api.git
cd mail-service-api
npm install
npm --prefix admin-ui install   # dependencias de la interfaz de administración
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
| `AZURE_TENANT_ID` | Tenant ID de Azure AD (usado internamente, el flujo OAuth2 usa `common` para multi-tenant) |
| `AZURE_CLIENT_ID` | Client ID del App Registration |
| `AZURE_CLIENT_SECRET` | Client secret del App Registration |
| `REDIRECT_URI` | URI de callback OAuth2 (default: `http://localhost:3002/auth/callback`) |
| `ADMIN_API_KEY` | Clave para endpoints administrativos |
| `PORT` | Puerto de la API (default: 3002) |
| `UPLOAD_DIR` | Directorio temporal para adjuntos (default: `./uploads`) |
| `MAX_ATTACHMENT_SIZE` | Tamaño máximo por archivo en bytes (default: 25MB) |
| `TOKEN_ENCRYPTION_KEY` | Clave AES-256 (32 bytes en base64) para cifrar los tokens OAuth2. **Obligatoria**: el servicio no arranca sin ella. Generarla con `openssl rand -base64 32` |

| `ADMIN_USERNAME` | Usuario del administrador de la interfaz web |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt de la contraseña del administrador. Generarlo con `npm run admin:hash`; nunca se guarda la contraseña |
| `ADMIN_SESSION_SECRET` | Secreto para firmar la sesión (mínimo 32 caracteres). Generarlo con `openssl rand -base64 48`. Cambiarlo cierra todas las sesiones |

> **Respalda `TOKEN_ENCRYPTION_KEY`** junto con los secretos de Azure. Si se pierde, los tokens guardados quedan ilegibles y cada buzón tendrá que autorizarse de nuevo.

Si faltan o son inválidas las tres variables `ADMIN_*`, el servicio arranca igual, pero la interfaz web responde "Administración web no configurada" y en el log aparece qué variable revisar.

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

## Interfaz de administración

Interfaz web en `http://localhost:3002/admin` para administrar sistemas (alta, edición, activación y rotación de API key) y sus buzones (alta, edición, buzón predeterminado, desactivación y enlaces de consentimiento). Tiene un único administrador, definido por `ADMIN_USERNAME` y `ADMIN_PASSWORD_HASH`.

1. Generar el hash de la contraseña (la pide dos veces sin mostrarla, mínimo 12 caracteres):
```bash
npm run admin:hash
```
2. Pegar la línea `ADMIN_PASSWORD_HASH=...` en `.env`, junto con `ADMIN_USERNAME` y `ADMIN_SESSION_SECRET`.
3. Compilar y arrancar: `npm run build` compila el API y la interfaz en un solo `dist/`, y `npm run start:prod` sirve ambos.

El hash contiene el carácter `$`. En `.env` se pega tal cual; en un shell o en un `env_file` de compose, escríbelo entre comillas simples o duplica cada `$` (`$$`).

**Desarrollo de la interfaz:** con el API corriendo (`npm run start:dev`), `npm run dev:admin` levanta Vite con recarga en caliente en `http://localhost:5173/admin/`. Vite reenvía las llamadas al API en `localhost:3002`, así que la cookie de sesión funciona igual que en producción. Ten en cuenta que `npm run start:dev` borra `dist/`, incluida la interfaz compilada; en desarrollo se usa Vite.

**Seguridad de la sesión:** cookie `httpOnly` y `SameSite=Strict` que caduca a las 8 horas, máximo 5 intentos de inicio de sesión por minuto por IP, y la interfaz nunca maneja la `ADMIN_API_KEY`. Si el servicio va detrás de un proxy inverso (nginx), publícalo por HTTPS para que la cookie se marque `Secure`. El servicio confía en las cabeceras `X-Forwarded-*` solo si vienen de la misma máquina o de la red privada.

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

Cada buzón debe autorizarlo su propietario mediante el flujo de consentimiento OAuth2. Primero, el administrador emite un enlace de consentimiento:

```bash
curl -X POST http://localhost:3002/mailboxes/{mailboxId}/consent-link \
  -H "x-admin-api-key: admin-dev-key-change-in-production"
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "url": "http://localhost:3002/auth/consent?token=...",
    "expiresAt": "..."
  }
}
```

Después se envía la `url` al propietario del buzón, que la abre en el navegador e inicia sesión en Microsoft **con la cuenta de ese buzón**. Al completarse, los tokens se almacenan cifrados y se refrescan cuando expiran.

- El enlace caduca en 24 horas y sirve una sola vez. Emitir uno nuevo invalida los pendientes del mismo buzón.
- Si se inicia sesión con otra cuenta, el consentimiento se rechaza y no se guarda nada; el mismo enlace sirve para reintentar con la cuenta correcta.
- Cambiar el email de un buzón revoca su autorización; hay que emitir un enlace nuevo.

### 4. Enviar un correo

```bash
curl -X POST http://localhost:3002/emails/send \
  -H "x-api-key: sk-xxxx..." \
  -F "from=controlgestion@dgeti.gob.mx" \
  -F "to=usuario@correo.com" \
  -F "subject=Bienvenida" \
  -F "html=<h1>Hola</h1><p>Bienvenido al sistema</p>"
```

Los campos `to`, `cc` y `bcc` aceptan un email individual o un JSON array para múltiples destinatarios: `'["uno@correo.com","dos@correo.com"]'`. `cc` y `bcc` son opcionales.

Para enviar con copia y copia oculta:

```bash
curl -X POST http://localhost:3002/emails/send \
  -H "x-api-key: sk-xxxx..." \
  -F 'to=["uno@correo.com","dos@correo.com"]' \
  -F "cc=jefe@correo.com" \
  -F 'bcc=["archivo@correo.com"]' \
  -F "subject=Aviso" \
  -F "html=<p>Mensaje con copia</p>"
```

Para enviar con archivos adjuntos (se envían con su nombre original, hasta 10 archivos por correo):

```bash
curl -X POST http://localhost:3002/emails/send \
  -H "x-api-key: sk-xxxx..." \
  -F "from=controlgestion@dgeti.gob.mx" \
  -F "to=usuario@correo.com" \
  -F "subject=Documento adjunto" \
  -F "html=<p>Adjunto el documento</p>" \
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

Esta API utiliza **permisos delegados** de Microsoft Graph con soporte **multi-tenant**. Cada buzón debe completar un flujo de consentimiento OAuth2 individual donde el usuario propietario del buzón autoriza el envío de correos en su nombre. Los tokens de acceso y refresco se almacenan de forma segura en la base de datos y se renuevan automáticamente.

El App Registration debe configurarse como **multi-tenant** ("Cualquier inquilino de Entra ID + cuentas personales de Microsoft") en Azure Portal.

### Pasos para configurar Azure AD

1. Ir a **Azure Portal > Azure Active Directory > App registrations**
2. Crear un nuevo registro de aplicación
3. En **Supported account types**, seleccionar **"Cualquier inquilino de Entra ID + cuentas personales de Microsoft"** (multi-tenant)
4. En **Authentication**, agregar la **Redirect URI** tipo Web (ej: `http://localhost:3002/auth/callback`)
5. En **API Permissions**, agregar **Microsoft Graph > Delegated Permissions > Mail.Send**, **offline_access**, **openid**, **email** y **profile** (los tres últimos identifican la cuenta que otorga el consentimiento)
6. Si el tenant tiene consentimiento de usuario deshabilitado, un administrador debe conceder **admin consent**
7. En **Certificates & secrets**, crear un nuevo client secret
8. Usar el **Tenant ID**, **Client ID** y **Client Secret** en el `.env`

### Flujo de consentimiento

1. Crear el buzón mediante el API administrativo
2. Emitir un enlace con `POST /mailboxes/{id}/consent-link` y enviarlo al propietario del buzón
3. El propietario abre el enlace e inicia sesión en Microsoft con la cuenta del buzón
4. Acepta los permisos solicitados (`Mail.Send`, `offline_access` y los de identificación)
5. El servicio verifica que la cuenta coincida con el email del buzón y guarda los tokens cifrados; el buzón queda listo para enviar correos

Si el tenant bloquea el consentimiento de usuario, la API mostrará un error claro indicando que se requiere aprobación administrativa.

### Cifrado de tokens y actualización desde versiones anteriores

> Para actualizar el servidor de producción, sigue la guía completa en [docs/ACTUALIZACION-PRODUCCION.md](docs/ACTUALIZACION-PRODUCCION.md).

Los tokens OAuth2 se guardan cifrados con AES-256-GCM usando `TOKEN_ENCRYPTION_KEY`. Las versiones anteriores los guardaban en texto plano. Para actualizar una instalación existente:

1. Generar la clave (`openssl rand -base64 32`), guardarla en `TOKEN_ENCRYPTION_KEY` y respaldarla.
2. Agregar los permisos `openid`, `email` y `profile` al App Registration.
3. Aplicar las migraciones: `npx prisma migrate deploy`.
4. Compilar y desplegar (`npm run build`). Los buzones ya autorizados siguen enviando mientras tanto.
5. Ejecutar `npm run tokens:encrypt`. Cifra los tokens que sigan en texto plano (se puede ejecutar varias veces) y lista los buzones autorizados antes de que existiera la verificación de identidad, para revisarlos. Si dudas de alguno, emite un enlace de consentimiento nuevo.
6. Avisar que los enlaces `/auth/consent?mailboxId=...` dejaron de funcionar.

**Rollback:** ejecutar `npm run tokens:encrypt -- --decrypt` antes de desplegar la versión anterior, que no entiende tokens cifrados.

### Notas de Seguridad

- `Mail.Send` como permiso delegado solo permite enviar en nombre del usuario que autorizó
- Esta API actúa como capa de gobernabilidad: cada sistema solo puede enviar desde sus buzones autorizados
- Las API Keys se almacenan como hash (bcrypt), nunca en texto plano
- Solo el propietario de un buzón puede autorizarlo: los enlaces de consentimiento los emite el administrador y el servicio verifica la cuenta que inicia sesión
- Los tokens OAuth2 se almacenan cifrados en la base de datos, nunca aparecen en respuestas de la API ni en logs, y se renuevan automáticamente (margen de 5 minutos)
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
    admin-session/   # Inicio de sesión del administrador web
    systems/         # CRUD de sistemas
    mailboxes/       # CRUD de buzones
    auth/            # OAuth2 consent flow (delegated permissions)
    emails/          # Endpoint de envío
    graph/           # Integración Microsoft Graph
    queue/           # BullMQ processor
    audit/           # Consulta de EmailLog
admin-ui/            # Interfaz de administración (Vue 3 + Vite + Tailwind + DaisyUI)
```

## Autenticación

| Credencial | Uso |
|--------|-----|
| `x-admin-api-key` | Endpoints administrativos (sistemas, buzones, enlaces de consentimiento, auditoría) desde scripts o curl |
| Sesión de administrador | Los mismos endpoints desde la interfaz `/admin` (cookie + cabecera `X-Admin-UI: 1`) |
| `x-api-key` | Endpoint de envío de correos (proporcionado al crear un sistema) |

## Licencia

MIT
