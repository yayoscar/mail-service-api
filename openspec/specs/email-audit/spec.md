# email-audit Specification

## Purpose

Permite al administrador consultar el historial de correos procesados por el servicio, con su estado, remitente, destinatarios, intentos y errores, para auditoría y diagnóstico.

## Requirements

### Requirement: Registro de auditoría por correo

El servicio SHALL mantener un `EmailLog` por cada correo aceptado, con sistema, buzón, remitente, destinatarios (`to`, `cc`, `bcc`), asunto, cuerpo HTML, metadatos de adjuntos, estado, proveedor (`MICROSOFT_GRAPH`), respuesta del proveedor, mensaje de error, número de intentos, fecha de envío y fechas de creación y actualización. El estado SHALL ser uno de `QUEUED`, `RETRYING`, `SENT` o `FAILED`.

#### Scenario: Ciclo de vida de un correo exitoso

- **WHEN** un correo se acepta y se envía al primer intento
- **THEN** su `EmailLog` pasa por `QUEUED`, `RETRYING` y termina en `SENT` con `attempts: 1`

### Requirement: Listado paginado de logs

El servicio SHALL permitir al administrador listar los logs mediante `GET /audit/email-logs`, ordenados del más reciente al más antiguo, con filtros opcionales `status` y `systemId`, y paginación por `page` (mínimo 1, 1 por defecto) y `limit` (entre 1 y 100, 20 por defecto). Cada log SHALL incluir el sistema (`id`, `key`, `name`) y el buzón (`id`, `email`, `displayName`). La respuesta SHALL tener la forma `{ data, total, page, limit }`, donde `total` es el número de logs que cumplen los filtros.

#### Scenario: Filtrar por estado

- **WHEN** el administrador consulta `GET /audit/email-logs?status=FAILED`
- **THEN** recibe solo los logs con estado `FAILED` y el `total` correspondiente

#### Scenario: Límite fuera de rango

- **WHEN** el administrador consulta con `limit=500`
- **THEN** la respuesta tiene estado 400

### Requirement: Detalle de un log

El servicio SHALL permitir al administrador consultar un log por id mediante `GET /audit/email-logs/:id`, incluyendo el sistema y el buzón asociados.

#### Scenario: Consulta de detalle

- **WHEN** el administrador consulta un log existente
- **THEN** recibe el log completo con su sistema y buzón
