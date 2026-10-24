# email-delivery Specification

## Purpose

Procesa de forma asíncrona los correos encolados: los envía a través de Microsoft Graph usando el token delegado del buzón remitente, reintenta los fallos transitorios y deja registrado el resultado final en el log de auditoría. También se encarga de borrar los adjuntos temporales.

## Requirements

### Requirement: Procesamiento de la cola de envío

El servicio SHALL consumir los trabajos de la cola BullMQ `email-send` (respaldada por Redis en `REDIS_HOST`/`REDIS_PORT`). Por cada intento, el servicio SHALL cargar el `EmailLog` referenciado, incrementar su contador `attempts` y ponerlo en estado `RETRYING` antes de enviar. Si el `EmailLog` no existe, el trabajo SHALL terminar sin efecto. Los trabajos completados y fallidos SHALL conservarse en Redis.

#### Scenario: Inicio de un intento

- **WHEN** el worker toma un trabajo cuyo `EmailLog` existe
- **THEN** el registro pasa a estado `RETRYING` y su `attempts` aumenta en 1

#### Scenario: Registro inexistente

- **WHEN** el worker toma un trabajo cuyo `EmailLog` no existe
- **THEN** el trabajo termina sin enviar nada y sin reintentar

### Requirement: Envío mediante Microsoft Graph

El servicio SHALL enviar cada correo con `POST https://graph.microsoft.com/v1.0/me/sendMail`, autenticado con un access token delegado válido del buzón remitente. El mensaje SHALL incluir el asunto, el cuerpo como HTML, los destinatarios `to`, y `cc`/`bcc` cuando existan, los adjuntos como `#microsoft.graph.fileAttachment` codificados en base64, y `saveToSentItems: true` para que el correo quede en Elementos enviados del buzón. Una respuesta 202 de Graph SHALL considerarse envío exitoso.

#### Scenario: Envío con adjuntos

- **WHEN** se procesa un correo con un PDF adjunto
- **THEN** Graph recibe el mensaje con el adjunto en base64 y tipo `application/pdf`

#### Scenario: Correo guardado en enviados

- **WHEN** Graph acepta el envío
- **THEN** el correo queda en la carpeta Elementos enviados del buzón remitente

### Requirement: Tipo MIME de los adjuntos

El servicio SHALL determinar el tipo MIME de cada adjunto por la extensión de su nombre original: `.pdf`, `.png`, `.jpg`/`.jpeg`, `.gif`, `.txt`, `.csv`, `.xlsx`, `.docx` y `.zip` con su tipo correspondiente. Si la extensión no es conocida, el servicio SHALL usar el tipo MIME declarado al subir el archivo; si tampoco hay uno declarado, MUST usar `application/octet-stream`.

#### Scenario: Extensión conocida

- **WHEN** se adjunta `reporte.xlsx`
- **THEN** se envía con tipo `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

#### Scenario: Extensión desconocida con tipo declarado

- **WHEN** se adjunta `datos.xml` declarado como `application/xml`
- **THEN** se envía con tipo `application/xml`

#### Scenario: Extensión desconocida

- **WHEN** se adjunta un archivo de extensión desconocida sin tipo declarado
- **THEN** se envía con tipo `application/octet-stream`

### Requirement: Resultado exitoso

Cuando Graph acepta el envío, el servicio SHALL marcar el `EmailLog` como `SENT`, registrar `providerResponse` y la fecha `sentAt`, y eliminar los archivos adjuntos temporales.

#### Scenario: Envío exitoso

- **WHEN** Graph responde 202
- **THEN** el `EmailLog` queda en `SENT` con `sentAt` establecido
- **AND** los adjuntos temporales se borran del disco

### Requirement: Reintentos ante fallos transitorios

Los errores de Graph con estado 429 o 5xx SHALL tratarse como transitorios. Mientras el número de intentos sea menor que 5, el servicio SHALL relanzar el error para que la cola reintente el trabajo con backoff exponencial (base de 5 segundos), dejando el `EmailLog` en `RETRYING` y conservando los adjuntos.

#### Scenario: Throttling de Graph

- **WHEN** Graph responde 429 en el segundo intento
- **THEN** el `EmailLog` permanece en `RETRYING`
- **AND** el trabajo se reintenta tras el backoff exponencial

### Requirement: Fallo definitivo

El servicio SHALL marcar el `EmailLog` como `FAILED` cuando el error no es transitorio (por ejemplo, respuestas 4xx distintas de 429, buzón sin consentimiento, fallo al renovar el token o errores sin código de estado HTTP), o cuando se alcanzan 5 intentos. El mensaje de error SHALL guardarse en `errorMessage`, truncado a 1000 caracteres, y los adjuntos temporales SHALL eliminarse. Un fallo definitivo MUST NOT generar más reintentos.

#### Scenario: Buzón sin consentimiento

- **WHEN** se procesa un correo cuyo buzón no completó el consentimiento OAuth2
- **THEN** el `EmailLog` queda en `FAILED` con un `errorMessage` que indica completar el consentimiento
- **AND** no se reintenta

#### Scenario: Error permanente de Graph

- **WHEN** Graph responde 400 por un mensaje inválido
- **THEN** el `EmailLog` queda en `FAILED` y los adjuntos se borran

#### Scenario: Agotamiento de reintentos

- **WHEN** Graph responde 503 en el quinto intento
- **THEN** el `EmailLog` queda en `FAILED` y los adjuntos se borran

### Requirement: Nombre original de los adjuntos

El servicio SHALL enviar cada adjunto con el nombre de archivo original con el que el sistema consumidor lo subió, preservando caracteres no ASCII como acentos y `ñ`. El nombre MUST NOT incluir componentes de ruta, y MUST NOT ser el nombre generado para el almacenamiento temporal.

#### Scenario: Nombre conservado

- **WHEN** un sistema adjunta `oficio-123.pdf`
- **THEN** el destinatario recibe un adjunto llamado `oficio-123.pdf`

#### Scenario: Nombre con acentos

- **WHEN** un sistema adjunta `Constancia_Pérez_Muñoz.pdf`
- **THEN** el destinatario recibe un adjunto llamado exactamente `Constancia_Pérez_Muñoz.pdf`

#### Scenario: Nombre con ruta

- **WHEN** el nombre de archivo recibido es `C:\docs\reporte.xlsx` o `../reporte.xlsx`
- **THEN** el destinatario recibe un adjunto llamado `reporte.xlsx`
