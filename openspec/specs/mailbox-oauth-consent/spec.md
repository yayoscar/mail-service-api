# mailbox-oauth-consent Specification

## Purpose

Obtiene y mantiene la autorización delegada de Microsoft Graph (`Mail.Send` + `offline_access`) para cada buzón, mediante el flujo OAuth2 Authorization Code multi-tenant. El propietario de cada buzón inicia sesión en Microsoft una vez; a partir de ahí el servicio conserva y renueva los tokens para enviar correos en su nombre.

## Requirements

### Requirement: Inicio del consentimiento

El servicio SHALL exponer `GET /auth/consent?token=<token>`, que acepta únicamente tokens de enlaces de consentimiento vigentes y no utilizados. Con un token válido, el servicio SHALL generar un valor `state` aleatorio y opaco ligado a esa solicitud de consentimiento, y SHALL redirigir (302) al endpoint de autorización multi-tenant `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` con `client_id` (de `AZURE_CLIENT_ID`), `response_type=code`, `redirect_uri` (de `REDIRECT_URI`), `response_mode=query`, `scope` que incluya `https://graph.microsoft.com/Mail.Send`, `offline_access` y los scopes OpenID necesarios para identificar la cuenta, `login_hint` con el email del buzón, y ese `state`. El `state` MUST NOT contener ni revelar el id del buzón. Si el token falta, no existe, caducó o ya se usó, el servicio SHALL mostrar una página de error con estado 400 sin redirigir.

#### Scenario: Buzón existente

- **WHEN** el propietario de un buzón registrado abre un enlace de consentimiento vigente de ese buzón
- **THEN** es redirigido a la página de inicio de sesión de Microsoft con `login_hint` igual al email del buzón y un `state` opaco

#### Scenario: Buzón inexistente

- **WHEN** alguien abre un enlace vigente cuyo buzón ya no existe
- **THEN** ve una página de error con estado 400 y no es redirigido

#### Scenario: Enlace caducado

- **WHEN** alguien abre un enlace emitido hace más de 24 horas
- **THEN** ve una página de error con estado 400 que indica que el enlace caducó y debe solicitar uno nuevo al administrador

#### Scenario: Enlace ya utilizado

- **WHEN** alguien abre un enlace con el que ya se completó un consentimiento
- **THEN** ve una página de error con estado 400 y no es redirigido

#### Scenario: Intento con el id del buzón

- **WHEN** alguien abre `/auth/consent?mailboxId=<id>` sin `token`
- **THEN** ve una página de error con estado 400 y no es redirigido

### Requirement: Recepción del consentimiento

El servicio SHALL exponer `GET /auth/callback`, que recibe `code` y `state` de Microsoft. El `state` MUST corresponder a una solicitud de consentimiento vigente y no utilizada; de lo contrario el servicio SHALL rechazar el callback sin contactar a Microsoft. Con un `state` válido, el servicio SHALL intercambiar el código por tokens en `https://login.microsoftonline.com/common/oauth2/v2.0/token`, verificar la identidad de la cuenta, y solo entonces guardar en el buzón de esa solicitud el access token, el refresh token y su fecha de expiración, marcándolo con `consentGiven = true` y la solicitud como utilizada. Completar el consentimiento MUST NOT modificar el campo `active` del buzón. El resultado SHALL mostrarse como una página HTML (200 en éxito, 400 en error) que indica que se puede cerrar la ventana, y todo texto dinámico de esa página, incluidos los mensajes recibidos de Microsoft, MUST escaparse como HTML.

#### Scenario: Consentimiento exitoso

- **WHEN** Microsoft redirige a `/auth/callback` con un `code` válido, un `state` vigente y la cuenta correcta
- **THEN** los tokens quedan guardados en el buzón con `consentGiven: true`
- **AND** la solicitud de consentimiento queda utilizada
- **AND** el usuario ve una página "Consentimiento exitoso" con estado 200

#### Scenario: State desconocido o reutilizado

- **WHEN** el callback recibe un `state` que no corresponde a una solicitud vigente y no utilizada
- **THEN** el usuario ve una página de error con estado 400
- **AND** no se intercambia el código ni se modifica ningún buzón

#### Scenario: El usuario o Microsoft devuelven un error

- **WHEN** el callback recibe el parámetro `error`
- **THEN** el usuario ve una página "Error de consentimiento" con estado 400 y la descripción del error

#### Scenario: Descripción de error con HTML

- **WHEN** el callback recibe `error_description=<script>alert(1)</script>`
- **THEN** la página muestra el texto literal escapado y no ejecuta ningún script

#### Scenario: Faltan parámetros

- **WHEN** el callback no recibe `code` o `state`
- **THEN** el usuario ve una página de error con estado 400

#### Scenario: El tenant exige consentimiento de administrador

- **WHEN** el intercambio del código falla con `AADSTS65001` o `consent_required`
- **THEN** el usuario ve una página de error con estado 400 que indica que se requiere consentimiento del administrador del tenant

#### Scenario: Buzón desactivado

- **WHEN** se completa el consentimiento de un buzón que el administrador desactivó después de emitir el enlace
- **THEN** los tokens se guardan pero el buzón permanece con `active: false`

### Requirement: Obtención de un token de acceso válido

Antes de cada envío, el servicio SHALL obtener un access token válido para el buzón remitente. Si el buzón no tiene consentimiento o access token, MUST fallar indicando que debe completarse el consentimiento. Si el token guardado vence en más de 5 minutos SHALL usarse tal cual; en caso contrario el servicio SHALL renovarlo con el refresh token antes de usarlo.

#### Scenario: Token vigente

- **WHEN** el token del buzón expira dentro de más de 5 minutos
- **THEN** se usa el token guardado sin contactar a Microsoft

#### Scenario: Token por expirar

- **WHEN** el token del buzón expira dentro de 5 minutos o ya expiró
- **THEN** el servicio lo renueva con el refresh token y usa el token nuevo

#### Scenario: Buzón sin consentimiento

- **WHEN** se intenta obtener un token para un buzón con `consentGiven: false`
- **THEN** la operación falla con un mensaje que indica usar el endpoint de consentimiento

### Requirement: Renovación de tokens

Al renovar, el servicio SHALL guardar el nuevo access token y su nueva expiración. Si Microsoft devuelve un refresh token nuevo SHALL reemplazar el anterior; si no, MUST conservar el existente. Si no hay refresh token o la renovación falla, el servicio SHALL fallar con un mensaje que indica que se requiere consentimiento nuevamente.

#### Scenario: Renovación sin refresh token nuevo

- **WHEN** Microsoft responde la renovación sin `refresh_token`
- **THEN** el buzón conserva su refresh token anterior y actualiza el access token y su expiración

#### Scenario: Refresh token revocado

- **WHEN** Microsoft rechaza el refresh token
- **THEN** la operación falla con un mensaje que indica que se requiere consentimiento nuevamente

### Requirement: Emisión de enlaces de consentimiento

El servicio SHALL permitir al administrador emitir un enlace de consentimiento para un buzón mediante `POST /mailboxes/:id/consent-link`, autenticado con `x-admin-api-key`. La respuesta SHALL incluir la URL completa del enlace y su fecha de expiración. Cada enlace MUST contener un token aleatorio no adivinable, MUST caducar 24 horas después de emitirse y MUST quedar inutilizable una vez que se completa un consentimiento con él. Emitir un enlace nuevo para un buzón MUST invalidar los enlaces pendientes anteriores de ese buzón. Si el buzón no existe o está inactivo SHALL responder 404 o 400 respectivamente.

#### Scenario: Emisión exitosa

- **WHEN** el administrador solicita un enlace para un buzón activo
- **THEN** la respuesta incluye una URL `/auth/consent?token=<token>` y su `expiresAt`, 24 horas en el futuro

#### Scenario: Nuevo enlace invalida el anterior

- **WHEN** el administrador emite un segundo enlace para el mismo buzón
- **THEN** el primer enlace deja de ser aceptado por `/auth/consent`

#### Scenario: Buzón inactivo

- **WHEN** el administrador solicita un enlace para un buzón desactivado
- **THEN** la respuesta tiene estado 400 y no se emite enlace

#### Scenario: Sin credenciales de administrador

- **WHEN** un cliente llama a `POST /mailboxes/:id/consent-link` sin `x-admin-api-key` válida
- **THEN** la respuesta tiene estado 401

### Requirement: Verificación de la identidad de la cuenta

Al recibir el consentimiento, el servicio SHALL identificar la cuenta de Microsoft que lo otorgó y MUST comparar su dirección de correo con el email registrado del buzón, sin distinguir mayúsculas y minúsculas. Si no coinciden, el servicio MUST NOT guardar los tokens, MUST NOT modificar el buzón, y SHALL mostrar una página de error que indique el email esperado y pida iniciar sesión con esa cuenta. El enlace de consentimiento MUST seguir siendo válido para reintentar mientras no haya caducado.

#### Scenario: Cuenta correcta

- **WHEN** el propietario de `controlgestion@dgeti.gob.mx` completa el consentimiento para ese buzón
- **THEN** los tokens se guardan y el buzón queda con `consentGiven: true`

#### Scenario: Cuenta distinta

- **WHEN** alguien completa el consentimiento con la cuenta `otra@dgeti.gob.mx` para el buzón `controlgestion@dgeti.gob.mx`
- **THEN** no se guardan tokens y el buzón no cambia
- **AND** el usuario ve una página de error con estado 400 que indica que debe iniciar sesión como `controlgestion@dgeti.gob.mx`

#### Scenario: Diferencia solo en mayúsculas

- **WHEN** la cuenta se identifica como `ControlGestion@DGETI.gob.mx` y el buzón está registrado como `controlgestion@dgeti.gob.mx`
- **THEN** la identidad se considera válida

### Requirement: Protección de los tokens OAuth2

El servicio MUST almacenar los access tokens y refresh tokens cifrados en reposo con una clave proporcionada por configuración, y MUST NOT escribir tokens, ni fragmentos de ellos, en logs. El servicio MUST negarse a arrancar si la clave de cifrado no está configurada o no es válida.

#### Scenario: Tokens en la base de datos

- **WHEN** se completa un consentimiento
- **THEN** los valores guardados de access token y refresh token no contienen el token en texto plano

#### Scenario: Arranque sin clave de cifrado

- **WHEN** el servicio arranca sin la clave de cifrado de tokens configurada
- **THEN** el arranque falla con un mensaje que indica la variable faltante

#### Scenario: Envío de un correo

- **WHEN** el worker obtiene un token y envía un correo
- **THEN** ninguna línea de log contiene el token ni un prefijo de él
