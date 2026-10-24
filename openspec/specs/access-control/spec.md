# access-control Specification

## Purpose

Define cómo se autentican los dos tipos de cliente del servicio: el administrador (mediante una clave única de entorno) y los sistemas consumidores (mediante una API key propia por sistema). Este control es la capa de gobierno que restringe quién puede administrar y quién puede enviar correos.

## Requirements

### Requirement: Autenticación de administrador

Los endpoints administrativos (sistemas, buzones y auditoría) SHALL exigir la cabecera `x-admin-api-key`, cuyo valor MUST coincidir exactamente con la variable de entorno `ADMIN_API_KEY`. La comparación MUST hacerse en tiempo constante. Si la cabecera falta, si `ADMIN_API_KEY` no está configurada o si el valor no coincide, el servicio SHALL responder 401.

#### Scenario: Clave de administrador válida

- **WHEN** un cliente llama a un endpoint administrativo con `x-admin-api-key` igual a `ADMIN_API_KEY`
- **THEN** la petición se procesa

#### Scenario: Cabecera ausente

- **WHEN** un cliente llama a un endpoint administrativo sin `x-admin-api-key`
- **THEN** la respuesta tiene estado 401 con el mensaje `Header x-admin-api-key es requerido`

#### Scenario: Clave incorrecta

- **WHEN** un cliente envía una `x-admin-api-key` distinta de `ADMIN_API_KEY`
- **THEN** la respuesta tiene estado 401 con el mensaje `Admin API Key inválida`

#### Scenario: Clave de administrador no configurada

- **WHEN** el servicio corre sin `ADMIN_API_KEY` definida
- **THEN** toda petición a un endpoint administrativo responde 401

### Requirement: Autenticación de sistemas consumidores

Los endpoints de envío SHALL exigir la cabecera `x-api-key`. El servicio SHALL compararla contra el hash bcrypt de la API key de cada sistema **activo**; al encontrar coincidencia, el sistema autenticado MUST quedar asociado a la petición para su uso posterior. Si la cabecera falta o ninguna API key de un sistema activo coincide, el servicio SHALL responder 401.

#### Scenario: API key válida

- **WHEN** un sistema activo envía su API key en `x-api-key`
- **THEN** la petición se procesa en nombre de ese sistema

#### Scenario: Cabecera ausente

- **WHEN** un cliente llama a un endpoint de envío sin `x-api-key`
- **THEN** la respuesta tiene estado 401 con el mensaje `Header x-api-key es requerido`

#### Scenario: Sistema desactivado

- **WHEN** un sistema con `active = false` envía su API key correcta
- **THEN** la respuesta tiene estado 401 con el mensaje `API Key inválida`

### Requirement: Almacenamiento seguro de API keys

El servicio MUST almacenar únicamente el hash bcrypt de cada API key de sistema y MUST NOT persistir ni volver a mostrar la clave en texto plano después de generarla. Las API keys SHALL tener el formato `sk-` seguido de 64 caracteres hexadecimales (32 bytes aleatorios).

#### Scenario: Generación de API key

- **WHEN** se genera una API key para un sistema
- **THEN** la clave devuelta tiene el formato `sk-<64 hex>`
- **AND** en la base de datos solo se guarda su hash bcrypt

### Requirement: Endpoints públicos

Los endpoints del flujo de consentimiento OAuth2 (`/auth/consent`, `/auth/callback`) y la documentación (`/docs`) SHALL ser accesibles sin cabeceras de autenticación.

#### Scenario: Acceso al flujo de consentimiento

- **WHEN** un navegador abre `/auth/consent?mailboxId=<id>` sin cabeceras de autenticación
- **THEN** la petición se procesa sin exigir API key
