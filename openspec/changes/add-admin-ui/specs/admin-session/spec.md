## Purpose

Permite que un único administrador, definido por configuración, inicie sesión en la interfaz web de administración sin manejar la `ADMIN_API_KEY`, protegiendo sus credenciales y la sesión resultante.

## ADDED Requirements

### Requirement: Configuración del administrador único

El servicio SHALL admitir exactamente un administrador web, definido por las variables de entorno `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (hash bcrypt de la contraseña) y `ADMIN_SESSION_SECRET` (al menos 32 caracteres). El servicio MUST NOT ofrecer endpoints para crear, listar ni modificar administradores. Si alguna variable falta o no es válida, el servicio SHALL arrancar normalmente, SHALL registrar una advertencia que nombre las variables afectadas sin mostrar sus valores, y el inicio de sesión SHALL responder 503 con el mensaje `Administración web no configurada`.

#### Scenario: Configuración completa

- **WHEN** el servicio arranca con las tres variables válidas
- **THEN** el inicio de sesión web está disponible

#### Scenario: Falta una variable

- **WHEN** el servicio arranca sin `ADMIN_PASSWORD_HASH`
- **THEN** el servicio arranca y atiende el resto del API con normalidad
- **AND** el log contiene una advertencia que menciona `ADMIN_PASSWORD_HASH` sin ningún valor
- **AND** `POST /admin-session/login` responde 503

#### Scenario: Hash inválido

- **WHEN** `ADMIN_PASSWORD_HASH` no tiene formato de hash bcrypt
- **THEN** `POST /admin-session/login` responde 503

#### Scenario: Secreto demasiado corto

- **WHEN** `ADMIN_SESSION_SECRET` tiene menos de 32 caracteres
- **THEN** `POST /admin-session/login` responde 503

### Requirement: Inicio de sesión

El servicio SHALL exponer `POST /admin-session/login`, que recibe `username` y `password`. Si coinciden con el administrador configurado, SHALL responder 200 con `{ username }` y establecer la cookie de sesión. Si el usuario o la contraseña no coinciden, SHALL responder 401 con el mensaje genérico `Usuario o contraseña incorrectos`, idéntico en ambos casos. La comprobación MUST tardar lo mismo exista o no el usuario, de modo que el tiempo de respuesta no revele cuál de los dos datos falló. Si falta algún campo SHALL responder 400.

#### Scenario: Credenciales correctas

- **WHEN** el administrador envía su usuario y contraseña correctos
- **THEN** la respuesta tiene estado 200 con `{ "username": "<usuario>" }`
- **AND** la respuesta establece la cookie de sesión

#### Scenario: Contraseña incorrecta

- **WHEN** se envía el usuario correcto con una contraseña incorrecta
- **THEN** la respuesta tiene estado 401 con el mensaje `Usuario o contraseña incorrectos` y no establece cookie

#### Scenario: Usuario inexistente

- **WHEN** se envía un usuario distinto al configurado
- **THEN** la respuesta es idéntica a la de una contraseña incorrecta

#### Scenario: Campos faltantes

- **WHEN** se envía la petición sin `password`
- **THEN** la respuesta tiene estado 400

### Requirement: Protección de las credenciales del administrador

La contraseña del administrador y su hash MUST NOT aparecer en ninguna respuesta del API, en la documentación Swagger ni en los logs. El servicio MUST NOT registrar en logs el cuerpo de las peticiones de inicio de sesión ni el valor de la cookie de sesión.

#### Scenario: Intento fallido registrado

- **WHEN** falla un inicio de sesión
- **THEN** el log puede registrar el intento y la IP, pero no la contraseña enviada

#### Scenario: Consulta de la sesión

- **WHEN** el administrador consulta su sesión
- **THEN** la respuesta contiene solo el nombre de usuario

### Requirement: Límite de intentos de inicio de sesión

El servicio SHALL aceptar como máximo 5 intentos de inicio de sesión por minuto desde una misma dirección IP. Los intentos que excedan ese límite SHALL responder 429 sin evaluar las credenciales.

#### Scenario: Fuerza bruta

- **WHEN** una IP envía el sexto intento de inicio de sesión dentro del mismo minuto
- **THEN** la respuesta tiene estado 429, aunque las credenciales sean correctas

#### Scenario: Ventana vencida

- **WHEN** la misma IP vuelve a intentar después de que pasó el minuto
- **THEN** el intento se evalúa normalmente

### Requirement: Cookie de sesión

La sesión SHALL mantenerse en una cookie `httpOnly`, `SameSite=Strict`, con ruta `/`, y marcada `Secure` cuando el servicio se publica por HTTPS. El valor MUST estar firmado con `ADMIN_SESSION_SECRET` y MUST NOT contener la contraseña ni su hash. La sesión SHALL caducar 8 horas después del inicio de sesión, sin renovarse por actividad. Una cookie alterada, caducada o firmada con otro secreto MUST tratarse como ausente.

#### Scenario: Sesión caducada

- **WHEN** el administrador hace una petición con una cookie emitida hace más de 8 horas
- **THEN** la petición se trata como no autenticada

#### Scenario: Cookie alterada

- **WHEN** una petición trae una cookie de sesión modificada
- **THEN** la petición se trata como no autenticada

#### Scenario: Revocación global

- **WHEN** se cambia `ADMIN_SESSION_SECRET` y se reinicia el servicio
- **THEN** todas las sesiones emitidas antes dejan de ser válidas

### Requirement: Consulta y cierre de sesión

El servicio SHALL exponer `GET /admin-session/me`, que responde 200 con `{ username }` si hay una sesión válida y 401 en caso contrario, y `POST /admin-session/logout`, que elimina la cookie de sesión del navegador y responde 200.

#### Scenario: Sesión activa

- **WHEN** el navegador con una sesión válida consulta `GET /admin-session/me`
- **THEN** recibe 200 con el nombre de usuario

#### Scenario: Cierre de sesión

- **WHEN** el administrador llama a `POST /admin-session/logout`
- **THEN** la cookie de sesión se elimina
- **AND** las peticiones siguientes desde ese navegador reciben 401

### Requirement: Protección contra CSRF

Toda petición autenticada mediante la cookie de sesión con un método distinto de `GET`, `HEAD` u `OPTIONS` MUST incluir la cabecera `X-Admin-UI: 1`; de lo contrario el servicio SHALL responder 403 sin ejecutar la operación. Las peticiones autenticadas con `x-admin-api-key` no requieren esa cabecera.

#### Scenario: Petición desde la interfaz

- **WHEN** la interfaz crea un sistema con la cookie de sesión y la cabecera `X-Admin-UI: 1`
- **THEN** la operación se ejecuta

#### Scenario: Petición forjada desde otro sitio

- **WHEN** llega una petición `POST` con la cookie de sesión pero sin la cabecera `X-Admin-UI`
- **THEN** la respuesta tiene estado 403 y no se modifica nada

#### Scenario: Script con API key

- **WHEN** un script llama a `POST /systems` con `x-admin-api-key` válida y sin `X-Admin-UI`
- **THEN** la operación se ejecuta
