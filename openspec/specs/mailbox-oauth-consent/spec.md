# mailbox-oauth-consent Specification

## Purpose

Obtiene y mantiene la autorización delegada de Microsoft Graph (`Mail.Send` + `offline_access`) para cada buzón, mediante el flujo OAuth2 Authorization Code multi-tenant. El propietario de cada buzón inicia sesión en Microsoft una vez; a partir de ahí el servicio conserva y renueva los tokens para enviar correos en su nombre.

## Requirements

### Requirement: Inicio del consentimiento

El servicio SHALL exponer `GET /auth/consent?mailboxId=<id>`, que redirige (302) al endpoint de autorización multi-tenant `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` con `client_id` (de `AZURE_CLIENT_ID`), `response_type=code`, `redirect_uri` (de `REDIRECT_URI`), `scope=https://graph.microsoft.com/Mail.Send offline_access`, `response_mode=query` y `state` igual al id del buzón. Si el buzón no existe SHALL responder 400.

#### Scenario: Buzón existente

- **WHEN** un usuario abre `/auth/consent?mailboxId=<id>` de un buzón registrado
- **THEN** es redirigido a la página de inicio de sesión de Microsoft con los parámetros indicados y `state=<id>`

#### Scenario: Buzón inexistente

- **WHEN** un usuario abre `/auth/consent` con un `mailboxId` que no existe
- **THEN** la respuesta tiene estado 400 con el mensaje `Buzón no encontrado`

### Requirement: Recepción del consentimiento

El servicio SHALL exponer `GET /auth/callback`, que recibe `code` y `state` de Microsoft, intercambia el código por tokens en `https://login.microsoftonline.com/common/oauth2/v2.0/token` y guarda en el buzón identificado por `state` el access token, el refresh token y su fecha de expiración, marcándolo con `consentGiven = true` y `active = true`. El resultado SHALL mostrarse al usuario como una página HTML (200 en éxito, 400 en error) que le indica que puede cerrar la ventana.

#### Scenario: Consentimiento exitoso

- **WHEN** Microsoft redirige a `/auth/callback` con un `code` válido y `state` de un buzón existente
- **THEN** los tokens quedan guardados en el buzón, con `consentGiven: true` y `active: true`
- **AND** el usuario ve una página "Consentimiento exitoso" con estado 200

#### Scenario: El usuario o Microsoft devuelven un error

- **WHEN** el callback recibe el parámetro `error`
- **THEN** el usuario ve una página "Error de consentimiento" con estado 400 y la descripción del error

#### Scenario: Faltan parámetros

- **WHEN** el callback no recibe `code` o `state`
- **THEN** el usuario ve una página de error con estado 400

#### Scenario: El tenant exige consentimiento de administrador

- **WHEN** el intercambio del código falla con `AADSTS65001` o `consent_required`
- **THEN** el usuario ve una página de error con estado 400 que indica que se requiere consentimiento del administrador del tenant

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
