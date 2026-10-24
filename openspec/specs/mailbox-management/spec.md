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

El servicio SHALL permitir al administrador listar los buzones **activos** de un sistema mediante `GET /systems/:systemId/mailboxes`, ordenados del más reciente al más antiguo. Los buzones inactivos MUST NOT aparecer en el listado.

#### Scenario: Listado con buzones inactivos

- **WHEN** un sistema tiene un buzón activo y uno desactivado
- **THEN** el listado devuelve solo el buzón activo

### Requirement: Actualización de buzones

El servicio SHALL permitir al administrador actualizar parcialmente `email`, `displayName` y `active` de un buzón mediante `PATCH /mailboxes/:id`. Si el buzón no existe SHALL responder 404; si el nuevo `email` pertenece a otro buzón SHALL responder 409.

#### Scenario: Cambio de email a uno existente

- **WHEN** el administrador cambia el email de un buzón al email de otro buzón
- **THEN** la respuesta tiene estado 409

### Requirement: Desactivación de buzones

El servicio SHALL permitir al administrador desactivar un buzón (borrado lógico) mediante `DELETE /mailboxes/:id`, dejando `active = false` sin eliminar el registro ni su historial. El buzón por defecto de un sistema MUST NOT poder desactivarse por esta vía.

#### Scenario: Desactivar un buzón secundario

- **WHEN** el administrador desactiva un buzón que no es el por defecto
- **THEN** el buzón queda con `active: false` y deja de poder usarse como remitente

#### Scenario: Intento de desactivar el buzón por defecto

- **WHEN** el administrador intenta desactivar el buzón por defecto
- **THEN** la respuesta tiene estado 400 con el mensaje `No se puede desactivar el buzón por defecto del sistema`
