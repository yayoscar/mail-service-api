## Why

El flujo de consentimiento OAuth2 permite que cualquier persona que conozca el `id` de un buzón lo vincule a **su propia** cuenta de Microsoft: `/auth/consent` es público, el `state` es el id del buzón (sin protección CSRF) y el callback nunca verifica qué cuenta inició sesión. Como el envío usa `/me/sendMail`, a partir de ese momento los correos institucionales salen desde la cuenta del atacante. Además, los access/refresh tokens se guardan en texto plano, se devuelven en las respuestas de los endpoints de buzones, se escriben parcialmente en logs, y la página del callback refleja `error_description` sin escapar (XSS). Es la capa de gobierno del servicio y hoy se puede eludir.

## What Changes

- **BREAKING** `GET /auth/consent?mailboxId=<id>` deja de existir. El consentimiento solo puede iniciarse con un enlace firmado de un solo uso y con caducidad, que emite el administrador mediante un nuevo endpoint `POST /mailboxes/:id/consent-link`.
- El `state` OAuth2 pasa a ser un valor aleatorio opaco, ligado a la solicitud de consentimiento, con caducidad y de un solo uso; deja de ser el id del buzón.
- El callback verifica que la cuenta que otorga el consentimiento corresponda al email registrado del buzón; si no coincide, rechaza y no guarda tokens. Para eso se piden además los scopes OpenID que identifican la cuenta, y se envía `login_hint` con el email del buzón.
- Los tokens OAuth2 se cifran en reposo y nunca aparecen en respuestas de la API ni en logs.
- La página HTML del callback escapa todo el contenido dinámico.
- Completar el consentimiento deja de reactivar un buzón desactivado por el administrador.
- Cambiar el email de un buzón revoca su consentimiento (los tokens pertenecían a la cuenta anterior).

## Capabilities

### New Capabilities

_Ninguna._

### Modified Capabilities

- `mailbox-oauth-consent`: nuevo endpoint de emisión de enlaces de consentimiento; el inicio del consentimiento requiere uno de esos enlaces; el callback valida `state`, verifica la identidad de la cuenta, escapa el HTML y no altera `active`; los tokens se cifran y no se registran en logs.
- `mailbox-management`: las respuestas de buzones dejan de exponer tokens; cambiar el email revoca el consentimiento.
- `access-control`: `/auth/consent` sigue sin cabeceras de autenticación, pero exige un enlace de consentimiento válido.

## Impact

- **API**: `POST /mailboxes/:id/consent-link` (nuevo, admin); `GET /auth/consent` cambia de `mailboxId` a `token` (breaking para quien tenga enlaces guardados o automatizados); respuestas de `/systems/:id/mailboxes` y `/mailboxes/:id` sin `accessToken`/`refreshToken`.
- **Código**: `src/modules/auth/*`, `src/modules/mailboxes/*`, `src/modules/graph/graph-mail.service.ts` (log del prefijo del token).
- **Base de datos**: nueva tabla para solicitudes de consentimiento; migración de datos que cifra los tokens existentes.
- **Configuración**: nueva variable de entorno con la clave de cifrado de tokens; `.env.example` y README.
- **Azure**: el App Registration debe permitir los scopes `openid`, `email` y `profile` (delegados, sin consentimiento de administrador en la mayoría de tenants).
- **Operación**: los buzones ya autorizados conservan sus tokens (cifrados por la migración), pero su identidad nunca se verificó; ver preguntas abiertas en el diseño.
