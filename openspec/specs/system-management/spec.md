# system-management Specification

## Purpose

Permite al administrador registrar y gestionar los sistemas consumidores (aplicaciones institucionales) que usan el servicio para enviar correos, incluyendo la emisión y rotación de su API key.

## Requirements

### Requirement: Registro de sistemas

El servicio SHALL permitir al administrador crear un sistema mediante `POST /systems` con un `key` y un `name`. El `key` MUST ser único y cumplir el patrón `^[a-z0-9-]+$`; el `name` MUST tener al menos 2 caracteres. Al crearlo, el servicio SHALL generar una API key nueva, devolverla en texto plano **una sola vez** junto con los datos del sistema (sin el hash), y responder 201. El sistema nuevo SHALL quedar activo.

#### Scenario: Creación exitosa

- **WHEN** el administrador envía `{ "key": "control-gestion", "name": "Control de Gestión" }`
- **THEN** la respuesta tiene estado 201
- **AND** incluye `id`, `key`, `name`, `active: true`, fechas y el campo `apiKey`
- **AND** no incluye `apiKeyHash`

#### Scenario: Key duplicada

- **WHEN** el administrador crea un sistema con un `key` que ya existe
- **THEN** la respuesta tiene estado 409

#### Scenario: Key con formato inválido

- **WHEN** el administrador envía un `key` con mayúsculas, espacios u otros caracteres fuera de `[a-z0-9-]`
- **THEN** la respuesta tiene estado 400

### Requirement: Listado de sistemas

El servicio SHALL permitir al administrador listar todos los sistemas (activos e inactivos) mediante `GET /systems`, ordenados del más reciente al más antiguo y sin exponer `apiKeyHash`.

#### Scenario: Listado

- **WHEN** el administrador consulta `GET /systems`
- **THEN** recibe todos los sistemas ordenados por `createdAt` descendente, sin el campo `apiKeyHash`

### Requirement: Actualización de sistemas

El servicio SHALL permitir al administrador actualizar parcialmente `key`, `name` y `active` de un sistema mediante `PATCH /systems/:id`, aplicando las mismas reglas de validación que en la creación. Si el sistema no existe SHALL responder 404. La respuesta MUST NOT incluir `apiKeyHash`.

#### Scenario: Desactivar un sistema

- **WHEN** el administrador envía `{ "active": false }` para un sistema existente
- **THEN** el sistema queda inactivo
- **AND** su API key deja de ser aceptada para enviar correos

#### Scenario: Sistema inexistente

- **WHEN** el administrador actualiza un `id` que no existe
- **THEN** la respuesta tiene estado 404

### Requirement: Regeneración de API key

El servicio SHALL permitir al administrador regenerar la API key de un sistema mediante `POST /systems/:id/regenerate-api-key`. La clave anterior MUST dejar de ser válida inmediatamente y la nueva SHALL devolverse en texto plano una sola vez, junto con `systemId` y un mensaje de aviso. Si el sistema no existe SHALL responder 404.

#### Scenario: Rotación de clave

- **WHEN** el administrador regenera la API key de un sistema existente
- **THEN** la respuesta tiene estado 200 e incluye la nueva `apiKey`
- **AND** la API key anterior es rechazada con 401 en peticiones posteriores
