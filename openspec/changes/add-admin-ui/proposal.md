## Why

Hoy la administración de sistemas y buzones solo se puede hacer con curl o Swagger, pegando la `ADMIN_API_KEY` en cada petición. Es propenso a errores (las API keys de sistema se muestran una sola vez y se pierden con facilidad en una terminal) y obliga a compartir la clave maestra con quien administra. Una interfaz web con un único usuario administrador permite gestionar las cuentas sin manejar la clave maestra y sin exponer credenciales en el navegador.

## What Changes

- Nueva interfaz web de administración servida por el mismo servicio en `/admin`. La v1 cubre solo la administración de cuentas: sistemas consumidores (alta, edición, activación y rotación de API key) y sus buzones (alta, edición, buzón por defecto, desactivación y reactivación, estado de consentimiento y enlace de consentimiento).
- Nuevo inicio de sesión para un **único** administrador, cuyas credenciales se definen en variables de entorno. Solo se guarda el hash de la contraseña, y ni la contraseña ni el hash se exponen en respuestas ni en logs. La sesión se mantiene con una cookie `httpOnly`.
- Los endpoints administrativos existentes aceptan, además de `x-admin-api-key`, una sesión de administrador válida. La cabecera se mantiene para scripts y automatización.
- El listado de buzones de un sistema puede incluir los inactivos, para poder verlos y reactivarlos.
- Desactivar el buzón por defecto queda prohibido también por `PATCH /mailboxes/:id`, no solo por `DELETE`.
- Si faltan las variables del administrador, el servicio arranca igual, pero el inicio de sesión responde 503.

## Capabilities

### New Capabilities

- `admin-session`: inicio y cierre de sesión del administrador único, configuración por entorno, protección de credenciales, límite de intentos, expiración y protección CSRF.
- `admin-ui`: interfaz web en `/admin` para administrar sistemas y buzones.

### Modified Capabilities

- `access-control`: la autenticación de administrador acepta la cabecera `x-admin-api-key` o una sesión de administrador válida.
- `mailbox-management`: el listado admite incluir buzones inactivos; la regla que impide desactivar el buzón por defecto aplica a cualquier vía de desactivación.

## Impact

- **Depende de `harden-oauth-consent`**, que debe implementarse antes: sin él, las respuestas de buzones llevarían tokens OAuth al navegador, y no existiría el endpoint de enlaces de consentimiento que usa la pantalla de buzones.
- **Código**: nuevo módulo `src/modules/admin-session/`, cambios en `AdminGuard`, `MailboxesService` y `main.ts`; nuevo proyecto `admin-ui/` (Vue 3 + Vite + Tailwind + DaisyUI).
- **Dependencias**: `@nestjs/serve-static`, `cookie-parser`, una librería de firma de tokens y un limitador de intentos.
- **Build y despliegue**: `npm run build` compila la UI y el API en un solo `dist/`; sigue siendo un solo artefacto y un solo proceso.
- **Configuración**: nuevas variables `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` y `ADMIN_SESSION_SECRET`; nuevo comando para generar el hash de la contraseña.
- **Fuera de alcance**: dashboard, consulta de auditoría, reenvío de correos y envío de pruebas.
