# api-conventions Specification

## Purpose

Define las convenciones transversales de la API HTTP: formato de respuestas exitosas y de error, validación de entrada, documentación OpenAPI y parámetros de arranque. Todos los demás módulos heredan estas reglas.

## Requirements

### Requirement: Envoltura de respuestas exitosas

El servicio SHALL envolver toda respuesta exitosa de los controladores JSON en un objeto `{ "success": true, "data": <payload> }`, donde `<payload>` es el valor devuelto por el endpoint.

#### Scenario: Respuesta exitosa de un endpoint

- **WHEN** un endpoint JSON responde correctamente con un payload
- **THEN** el cuerpo de la respuesta es `{ "success": true, "data": <payload> }`

### Requirement: Formato uniforme de errores

El servicio SHALL responder cualquier excepción con un cuerpo `{ statusCode, message, timestamp, path }`, donde `timestamp` es ISO-8601 y `path` es la URL solicitada. Las excepciones HTTP MUST conservar su código de estado y mensaje; cualquier otra excepción MUST responderse con 500 y el mensaje `Error interno del servidor`, sin exponer detalles internos. Cada error SHALL registrarse en el log con método, URL, estado y mensaje.

#### Scenario: Excepción HTTP conocida

- **WHEN** un endpoint lanza una excepción HTTP con estado 404 y mensaje "Sistema con id 'x' no encontrado"
- **THEN** la respuesta tiene estado 404
- **AND** el cuerpo contiene `statusCode: 404`, ese `message`, un `timestamp` y el `path` solicitado

#### Scenario: Error inesperado

- **WHEN** un endpoint lanza un error que no es una excepción HTTP
- **THEN** la respuesta tiene estado 500 y `message: "Error interno del servidor"`

### Requirement: Validación estricta de entrada

El servicio SHALL validar todos los cuerpos y parámetros de consulta contra sus DTOs, transformando los valores a los tipos declarados. Las propiedades no declaradas en el DTO MUST provocar un rechazo con estado 400.

#### Scenario: Propiedad no permitida

- **WHEN** un cliente envía una propiedad que no existe en el DTO del endpoint
- **THEN** la respuesta tiene estado 400

#### Scenario: Valor inválido

- **WHEN** un cliente envía un campo que no cumple las reglas del DTO (por ejemplo, un email mal formado)
- **THEN** la respuesta tiene estado 400 con la descripción del error de validación

### Requirement: Documentación OpenAPI

El servicio SHALL publicar documentación Swagger en `/docs`, declarando los esquemas de seguridad `x-api-key` y `x-admin-api-key` como API keys en cabecera.

#### Scenario: Consulta de la documentación

- **WHEN** un cliente abre `/docs`
- **THEN** obtiene la interfaz Swagger con todos los endpoints y ambos esquemas de seguridad

### Requirement: Arranque y configuración

El servicio SHALL escuchar en el puerto definido por la variable `PORT` (3002 por defecto), SHALL cargar su configuración desde variables de entorno o `.env`, y SHALL habilitar CORS.

#### Scenario: Puerto por defecto

- **WHEN** el servicio arranca sin la variable `PORT`
- **THEN** escucha en el puerto 3002
