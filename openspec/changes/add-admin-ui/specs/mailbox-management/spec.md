## MODIFIED Requirements

### Requirement: Listado de buzones de un sistema

El servicio SHALL permitir al administrador listar los buzones de un sistema mediante `GET /systems/:systemId/mailboxes`, ordenados del más reciente al más antiguo. Por defecto el listado SHALL incluir solo los buzones **activos**; con el parámetro `includeInactive=true` SHALL incluir también los inactivos, cada uno con su campo `active`.

#### Scenario: Listado con buzones inactivos

- **WHEN** un sistema tiene un buzón activo y uno desactivado
- **THEN** el listado devuelve solo el buzón activo

#### Scenario: Listado incluyendo inactivos

- **WHEN** el administrador consulta `GET /systems/:systemId/mailboxes?includeInactive=true` de un sistema con un buzón activo y uno desactivado
- **THEN** el listado devuelve ambos buzones, con `active: true` y `active: false` respectivamente

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
