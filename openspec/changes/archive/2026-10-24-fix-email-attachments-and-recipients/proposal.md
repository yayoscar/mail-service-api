## Why

Hay tres defectos en el envío que afectan directamente a los destinatarios y a la operación:

- Los adjuntos llegan con el nombre aleatorio que se les dio en disco (`1716493200000-a1b2c3d4e5f6.pdf`) en lugar del nombre original del archivo.
- Probablemente cualquier solicitud que incluya `cc` o `bcc` se rechaza con 400, aunque Swagger y el README los documentan como soportados: el DTO los convierte en arreglo y después exige que sean texto.
- Los archivos subidos quedan huérfanos en `UPLOAD_DIR` cuando la solicitud se rechaza después de recibirlos (remitente no autorizado, sin buzón por defecto, error de validación), lo que hace crecer el disco sin límite.

## What Changes

- Los adjuntos se envían a Microsoft Graph con su nombre de archivo original, incluidos nombres con acentos y `ñ`, sin componentes de ruta.
- El tipo MIME de cada adjunto se determina por la extensión del nombre original; si la extensión no es conocida, se usa el tipo declarado al subir el archivo y, en último caso, `application/octet-stream`.
- Se corrige la validación de `cc` y `bcc` para que acepten un email o un arreglo JSON de emails, como ya establece el spec `email-submission` (corrección de código, sin cambio de spec).
- Toda solicitud de envío rechazada después de recibir adjuntos borra los archivos temporales antes de responder.

## Capabilities

### New Capabilities

_Ninguna._

### Modified Capabilities

- `email-delivery`: nuevo requisito sobre el nombre original de los adjuntos; el requisito de tipo MIME pasa a basarse en el nombre original y en el tipo declarado.
- `email-submission`: nuevo requisito de limpieza de adjuntos cuando la solicitud se rechaza.

## Impact

- **Código**: `src/modules/emails/dto/send-email.dto.ts`, `src/modules/emails/emails.service.ts` y/o `emails.controller.ts` (limpieza ante rechazo), `src/modules/queue/email.processor.ts` y `attachment.utils.ts` (usar los metadatos del `EmailLog` en lugar de la ruta en disco).
- **Compatibilidad**: los trabajos que ya estén en la cola al desplegar solo traen rutas; el worker debe seguir procesándolos.
- **Codificación**: multer/busboy decodifica por defecto los nombres de archivo como latin1, lo que deforma los acentos; hay que confirmarlo y corregirlo.
- **Fuera de alcance, conviene un change aparte**: Microsoft Graph limita el cuerpo de `sendMail` a unos 4 MB, pero el servicio acepta adjuntos de 25 MB, así que los adjuntos de más de ~3 MB probablemente terminan en `FAILED`. Enviarlos requiere sesiones de carga de Graph. Tampoco cubre los reintentos ante errores de red, el 404 de auditoría ni las inconsistencias de estado detectadas en la exploración.
