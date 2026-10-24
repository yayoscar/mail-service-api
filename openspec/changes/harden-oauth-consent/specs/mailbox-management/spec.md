## ADDED Requirements

### Requirement: Representación de buzones sin credenciales

Ninguna respuesta de la API que devuelva buzones MUST incluir `accessToken` ni `refreshToken`. Las respuestas SHALL incluir `consentGiven` para que el administrador conozca el estado de autorización de cada buzón.

#### Scenario: Listado de buzones autorizados

- **WHEN** el administrador lista los buzones de un sistema que tiene un buzón con consentimiento completado
- **THEN** el buzón aparece con `consentGiven: true`
- **AND** la respuesta no contiene `accessToken` ni `refreshToken`

#### Scenario: Alta y actualización

- **WHEN** el administrador crea o actualiza un buzón
- **THEN** la respuesta no contiene `accessToken` ni `refreshToken`

## MODIFIED Requirements

### Requirement: Actualización de buzones

El servicio SHALL permitir al administrador actualizar parcialmente `email`, `displayName` y `active` de un buzón mediante `PATCH /mailboxes/:id`. Si el buzón no existe SHALL responder 404; si el nuevo `email` pertenece a otro buzón SHALL responder 409. Si el `email` cambia, el servicio MUST revocar el consentimiento del buzón: borrar sus tokens, dejar `consentGiven = false` e invalidar los enlaces de consentimiento pendientes, porque los tokens existentes pertenecen a la cuenta anterior.

#### Scenario: Cambio de email a uno existente

- **WHEN** el administrador cambia el email de un buzón al email de otro buzón
- **THEN** la respuesta tiene estado 409

#### Scenario: Cambio de email revoca el consentimiento

- **WHEN** el administrador cambia el email de un buzón con `consentGiven: true`
- **THEN** el buzón queda con `consentGiven: false` y sin tokens
- **AND** los correos que se envíen desde él fallan hasta que se complete un consentimiento nuevo

#### Scenario: Cambio de nombre visible

- **WHEN** el administrador cambia solo el `displayName` de un buzón autorizado
- **THEN** el buzón conserva su consentimiento y sus tokens
