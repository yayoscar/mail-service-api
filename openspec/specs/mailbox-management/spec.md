# mailbox-management Specification

## Purpose

Permite al administrador definir qué buzones de Microsoft 365 / Outlook puede usar cada sistema como remitente, y cuál es el buzón por defecto de cada sistema. Es la lista de autorización que impide a un sistema enviar desde cuentas que no le pertenecen.

## Requirements

### Requirement: Alta de buzones autorizados

El servicio SHALL permitir al administrador agregar un buzón a un sistema mediante `POST /systems/:systemId/mailboxes` con `email`, `displayName` e `isDefault` opcional (falso por defecto). El `email` MUST ser único en todo el servicio, de modo que un buzón pertenece a un solo sistema. Un buzón nuevo SHALL quedar activo y sin consentimiento OAuth2 (`consentGiven = false`). La respuesta SHALL tener estado 201.

#### Scenario: Alta exitosa

- **WHEN** el administrador agrega `controlgestion@dgeti.gob.mx` a un sistema existente
- **THEN** la respuesta tiene estado 201 con el buzón creado, activo y con `consentGiven: false`

#### Scenario: Sistema inexistente

- **WHEN** el administrador agrega un buzón a un `systemId` que no existe
- **THEN** la respuesta tiene estado 404

#### Scenario: Email ya registrado

- **WHEN** el administrador agrega un buzón cuyo email ya existe en cualquier sistema
- **THEN** la respuesta tiene estado 409

### Requirement: Un único buzón por defecto por sistema

Cada sistema SHALL tener como máximo un buzón marcado como por defecto. Al crear un buzón con `isDefault: true` o al marcar uno mediante `PATCH /mailboxes/:id/default`, el servicio MUST desmarcar cualquier otro buzón por defecto del mismo sistema dentro de la misma transacción.

#### Scenario: Alta de un nuevo buzón por defecto

- **WHEN** el sistema ya tiene un buzón por defecto y el administrador crea otro con `isDefault: true`
- **THEN** el buzón nuevo queda como por defecto y el anterior deja de serlo

#### Scenario: Cambio de buzón por defecto

- **WHEN** el administrador llama a `PATCH /mailboxes/:id/default` sobre un buzón existente
- **THEN** ese buzón queda como el único por defecto de su sistema

### Requirement: Listado de buzones de un sistema

El servicio SHALL permitir al administrador listar los buzones de un sistema mediante `GET /systems/:systemId/mailboxes`, ordenados del más reciente al más antiguo. Por defecto el listado SHALL incluir solo los buzones **activos**; con el parámetro `includeInactive=true` SHALL incluir también los inactivos, cada uno con su campo `active`.

#### Scenario: Listado con buzones inactivos

- **WHEN** un sistema tiene un buzón activo y uno desactivado
- **THEN** el listado devuelve solo el buzón activo

#### Scenario: Listado incluyendo inactivos

- **WHEN** el administrador consulta `GET /systems/:systemId/mailboxes?includeInactive=true` de un sistema con un buzón activo y uno desactivado
- **THEN** el listado devuelve ambos buzones, con `active: true` y `active: false` respectivamente

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

### Requirement: Desactivación de buzones

El servicio SHALL permitir al administrador desactivar un buzón (borrado lógico) mediante `DELETE /mailboxes/:id`, dejando `active = false` sin eliminar el registro ni su historial. El buzón por defecto de un sistema MUST NOT poder desactivarse por ninguna vía, ni con `DELETE /mailboxes/:id` ni con `PATCH /mailboxes/:id` enviando `active: false`.

#### Scenario: Desactivar un buzón secundario

- **WHEN** el administrador desactiva un buzón que no es el por defecto
- **THEN** el buzón queda con `active: false` y deja de poder usarse como remitente

#### Scenario: Intento de desactivar el buzón por defecto

- **WHEN** el administrador intenta desactivar el buzón por defecto
- **THEN** la respuesta tiene estado 400 con el mensaje `No se puede desactivar el buzón por defecto del sistema`

#### Scenario: Intento de desactivar el buzón por defecto mediante PATCH

- **WHEN** el administrador envía `PATCH /mailboxes/:id` con `{ "active": false }` sobre el buzón por defecto
- **THEN** la respuesta tiene estado 400 con el mensaje `No se puede desactivar el buzón por defecto del sistema` y el buzón sigue activo

### Requirement: Representación de buzones sin credenciales

Ninguna respuesta de la API que devuelva buzones MUST incluir `accessToken` ni `refreshToken`. Las respuestas SHALL incluir `consentGiven` para que el administrador conozca el estado de autorización de cada buzón.

#### Scenario: Listado de buzones autorizados

- **WHEN** el administrador lista los buzones de un sistema que tiene un buzón con consentimiento completado
- **THEN** el buzón aparece con `consentGiven: true`
- **AND** la respuesta no contiene `accessToken` ni `refreshToken`

#### Scenario: Alta y actualización

- **WHEN** el administrador crea o actualiza un buzón
- **THEN** la respuesta no contiene `accessToken` ni `refreshToken`
