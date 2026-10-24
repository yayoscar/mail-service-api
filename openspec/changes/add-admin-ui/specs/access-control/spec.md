## MODIFIED Requirements

### Requirement: Autenticación de administrador

Los endpoints administrativos (sistemas, buzones, auditoría y emisión de enlaces de consentimiento) SHALL aceptar cualquiera de estas dos credenciales: la cabecera `x-admin-api-key` cuyo valor coincide exactamente con la variable de entorno `ADMIN_API_KEY`, comparada en tiempo constante; o una sesión de administrador web válida, sujeta a la protección contra CSRF. Si no se presenta ninguna credencial válida, el servicio SHALL responder 401. Una `x-admin-api-key` presente pero incorrecta MUST rechazarse aunque también exista una sesión válida.

#### Scenario: Clave de administrador válida

- **WHEN** un cliente llama a un endpoint administrativo con `x-admin-api-key` igual a `ADMIN_API_KEY`
- **THEN** la petición se procesa

#### Scenario: Cabecera ausente

- **WHEN** un cliente llama a un endpoint administrativo sin `x-admin-api-key` y sin sesión de administrador
- **THEN** la respuesta tiene estado 401 con el mensaje `Header x-admin-api-key es requerido`

#### Scenario: Clave incorrecta

- **WHEN** un cliente envía una `x-admin-api-key` distinta de `ADMIN_API_KEY`
- **THEN** la respuesta tiene estado 401 con el mensaje `Admin API Key inválida`

#### Scenario: Clave de administrador no configurada

- **WHEN** el servicio corre sin `ADMIN_API_KEY` definida y la petición no trae una sesión de administrador válida
- **THEN** la petición a un endpoint administrativo responde 401

#### Scenario: Sesión de administrador

- **WHEN** el navegador con una sesión de administrador válida consulta `GET /systems` sin `x-admin-api-key`
- **THEN** la petición se procesa

#### Scenario: Clave incorrecta con sesión válida

- **WHEN** una petición trae una sesión válida y además una `x-admin-api-key` incorrecta
- **THEN** la respuesta tiene estado 401
