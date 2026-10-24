## Purpose

Interfaz web de administración, servida por el propio servicio, para que el administrador gestione los sistemas consumidores y sus buzones de Microsoft 365 sin usar curl ni manejar la `ADMIN_API_KEY`.

## ADDED Requirements

### Requirement: Publicación de la interfaz

El servicio SHALL servir la interfaz de administración en `/admin`. Cualquier ruta bajo `/admin/` que no corresponda a un archivo estático SHALL devolver la página principal de la interfaz, para que funcionen los enlaces directos y la recarga del navegador. Los archivos estáticos de la interfaz no contienen datos y SHALL servirse sin autenticación. Las rutas existentes del API MUST NOT verse afectadas.

#### Scenario: Acceso a la raíz

- **WHEN** un navegador abre `/admin`
- **THEN** recibe la interfaz de administración

#### Scenario: Enlace directo

- **WHEN** un navegador recarga `/admin/sistemas/<id>`
- **THEN** recibe la interfaz, que muestra la pantalla de ese sistema tras validar la sesión

#### Scenario: API intacta

- **WHEN** un sistema consumidor llama a `POST /emails/send`
- **THEN** la petición se atiende igual que antes de existir la interfaz

### Requirement: Acceso con sesión

La interfaz SHALL mostrar la pantalla de inicio de sesión cuando no hay una sesión válida, y la lista de sistemas tras iniciar sesión. Si cualquier petición al API responde 401, la interfaz SHALL volver a la pantalla de inicio de sesión indicando que la sesión terminó. La interfaz SHALL ofrecer una opción para cerrar sesión. Si el inicio de sesión responde 503, la interfaz SHALL indicar que la administración web no está configurada.

#### Scenario: Sin sesión

- **WHEN** un navegador sin sesión abre `/admin/sistemas`
- **THEN** ve la pantalla de inicio de sesión

#### Scenario: Sesión caducada durante el uso

- **WHEN** la sesión caduca y el administrador intenta guardar un cambio
- **THEN** la interfaz muestra la pantalla de inicio de sesión con el aviso de que la sesión terminó

#### Scenario: Demasiados intentos

- **WHEN** el inicio de sesión responde 429
- **THEN** la interfaz indica que se espere un minuto antes de reintentar

### Requirement: Manejo seguro de credenciales en el navegador

La interfaz MUST NOT solicitar, recibir ni almacenar la `ADMIN_API_KEY`. MUST NOT guardar en `localStorage`, `sessionStorage` ni en cookies accesibles por JavaScript ninguna credencial ni API key de sistema. Todas sus peticiones al API SHALL hacerse al mismo origen, con la cookie de sesión y la cabecera `X-Admin-UI: 1`.

#### Scenario: Almacenamiento del navegador

- **WHEN** el administrador crea un sistema y cierra el diálogo de la API key
- **THEN** la API key no queda en `localStorage`, `sessionStorage` ni en cookies legibles por JavaScript

### Requirement: Gestión de sistemas

La interfaz SHALL listar todos los sistemas, activos e inactivos, con su `key`, nombre y estado. SHALL permitir crear un sistema con `key` y nombre, editar su nombre, activarlo o desactivarlo, y rotar su API key. Desactivar un sistema y rotar su API key SHALL requerir confirmación explícita que explique la consecuencia: el sistema deja de poder enviar, o la API key anterior deja de funcionar de inmediato.

#### Scenario: Alta de sistema

- **WHEN** el administrador crea el sistema `control-gestion`
- **THEN** el sistema aparece en la lista como activo

#### Scenario: Desactivación con confirmación

- **WHEN** el administrador elige desactivar un sistema
- **THEN** la interfaz pide confirmación indicando que el sistema dejará de poder enviar correos, y solo lo desactiva si confirma

#### Scenario: Error del API

- **WHEN** el alta falla porque la `key` ya existe
- **THEN** la interfaz muestra el mensaje del API y conserva los datos capturados en el formulario

### Requirement: Visualización única de API keys

Al crear un sistema o rotar su API key, la interfaz SHALL mostrar la API key en un diálogo con un botón para copiarla y la advertencia de que no se volverá a mostrar. Al cerrar ese diálogo, la API key MUST NOT poder recuperarse desde la interfaz.

#### Scenario: Rotación de API key

- **WHEN** el administrador confirma la rotación de la API key de un sistema
- **THEN** la interfaz muestra la nueva API key una sola vez, con botón de copiar y la advertencia correspondiente

#### Scenario: Diálogo cerrado

- **WHEN** el administrador cierra el diálogo de la API key
- **THEN** no hay forma de volver a verla desde la interfaz

### Requirement: Gestión de buzones

Para cada sistema, la interfaz SHALL listar todos sus buzones, activos e inactivos, mostrando email, nombre visible, si es el buzón por defecto, si está activo y su estado de consentimiento (`Autorizado` o `Pendiente`). SHALL permitir agregar un buzón (email, nombre visible y si es por defecto), editar su email y nombre visible, marcarlo como por defecto, desactivarlo y reactivarlo. La opción de desactivar MUST NOT ofrecerse para el buzón por defecto. Al editar el email de un buzón autorizado, la interfaz SHALL advertir que se perderá su autorización.

#### Scenario: Buzón inactivo visible

- **WHEN** un sistema tiene un buzón desactivado
- **THEN** la interfaz lo muestra marcado como inactivo, con la opción de reactivarlo

#### Scenario: Cambio de buzón por defecto

- **WHEN** el administrador marca otro buzón como por defecto
- **THEN** la lista muestra ese buzón como el único por defecto del sistema

#### Scenario: Buzón por defecto

- **WHEN** el administrador ve el buzón por defecto
- **THEN** la opción de desactivarlo no está disponible

#### Scenario: Cambio de email de un buzón autorizado

- **WHEN** el administrador edita el email de un buzón con estado `Autorizado`
- **THEN** la interfaz advierte que se perderá la autorización antes de guardar

### Requirement: Autorización de buzones

Para cada buzón activo, la interfaz SHALL permitir generar un enlace de consentimiento y mostrarlo con su fecha de expiración, un botón para copiarlo y una opción para abrirlo en una pestaña nueva. Generar un enlace nuevo SHALL advertir que los enlaces anteriores de ese buzón dejan de funcionar.

#### Scenario: Generar enlace

- **WHEN** el administrador genera el enlace de consentimiento de un buzón `Pendiente`
- **THEN** la interfaz muestra la URL, su expiración, el botón de copiar y la opción de abrirla

#### Scenario: Autorizar desde el mismo navegador

- **WHEN** el administrador abre el enlace en una pestaña nueva y completa el consentimiento con la cuenta del buzón
- **THEN** al volver a la lista, el buzón aparece como `Autorizado`
