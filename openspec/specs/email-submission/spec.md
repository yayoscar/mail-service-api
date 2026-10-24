# email-submission Specification

## Purpose

Recibe las solicitudes de envío de correo de los sistemas consumidores, valida el contenido, decide desde qué buzón autorizado se envía, guarda los adjuntos temporalmente y encola el envío para su procesamiento asíncrono. La respuesta confirma que el correo fue aceptado, no que fue entregado.

## Requirements

### Requirement: Endpoint de envío

El servicio SHALL exponer `POST /emails/send`, autenticado con la API key del sistema, que acepta `multipart/form-data` con los campos `to`, `cc`, `bcc`, `subject`, `html`, `from` y archivos en el campo `attachments`.

#### Scenario: Envío sin API key

- **WHEN** un cliente llama a `POST /emails/send` sin `x-api-key`
- **THEN** la respuesta tiene estado 401

### Requirement: Validación del contenido del correo

El servicio SHALL exigir `to`, `subject` y `html`; `subject` y `html` MUST ser texto no vacío. Los campos de destinatarios (`to`, `cc`, `bcc`) SHALL aceptar un email individual o un arreglo JSON de emails, y cada dirección MUST tener formato de email válido. `cc` y `bcc` son opcionales. `from`, si se envía, MUST ser un email válido.

#### Scenario: Destinatario individual

- **WHEN** el cliente envía `to=usuario@correo.com`
- **THEN** el correo se acepta con `to` igual a `["usuario@correo.com"]`

#### Scenario: Varios destinatarios

- **WHEN** el cliente envía `to=["uno@correo.com","dos@correo.com"]`
- **THEN** el correo se acepta con ambos destinatarios

#### Scenario: Copia y copia oculta

- **WHEN** el cliente envía `cc=["copia@correo.com"]` y `bcc=oculta@correo.com`
- **THEN** el correo se acepta con esos destinatarios en copia y copia oculta

#### Scenario: Email inválido en la lista

- **WHEN** el arreglo de destinatarios contiene una dirección mal formada
- **THEN** la respuesta tiene estado 400 indicando el email inválido

#### Scenario: Formato de destinatarios no reconocido

- **WHEN** `to` no es un email ni un arreglo JSON
- **THEN** la respuesta tiene estado 400 indicando el formato esperado

#### Scenario: Falta el asunto o el cuerpo

- **WHEN** el cliente omite `subject` o `html`, o los envía vacíos
- **THEN** la respuesta tiene estado 400

### Requirement: Resolución del buzón remitente

El servicio SHALL determinar el buzón remitente así: si la solicitud incluye `from`, MUST corresponder a un buzón **activo** del sistema autenticado, o la solicitud SHALL rechazarse con 403; si no incluye `from`, SHALL usarse el buzón por defecto **activo** del sistema, o la solicitud SHALL rechazarse con 400. Un sistema MUST NOT poder enviar desde un buzón de otro sistema.

#### Scenario: Remitente autorizado

- **WHEN** el sistema envía con `from` igual a uno de sus buzones activos
- **THEN** el correo se acepta con ese buzón como remitente

#### Scenario: Remitente de otro sistema

- **WHEN** el sistema envía con `from` igual a un buzón registrado para otro sistema
- **THEN** la respuesta tiene estado 403 con el mensaje `El buzón '<from>' no está autorizado para este sistema`

#### Scenario: Remitente desactivado

- **WHEN** el sistema envía con `from` igual a uno de sus buzones inactivos
- **THEN** la respuesta tiene estado 403

#### Scenario: Sin remitente y con buzón por defecto

- **WHEN** el sistema envía sin `from` y tiene un buzón por defecto activo
- **THEN** el correo se acepta con el buzón por defecto como remitente

#### Scenario: Sin remitente ni buzón por defecto

- **WHEN** el sistema envía sin `from` y no tiene buzón por defecto activo
- **THEN** la respuesta tiene estado 400 con el mensaje `No hay un buzón default configurado para este sistema`

### Requirement: Recepción de adjuntos

El servicio SHALL aceptar hasta 10 archivos en el campo `attachments`, cada uno de hasta 25 MB (26 214 400 bytes). Los archivos SHALL guardarse temporalmente en el directorio `UPLOAD_DIR` (`./uploads` por defecto, creado si no existe) con un nombre único generado. Una solicitud que exceda estos límites MUST rechazarse.

#### Scenario: Adjunto dentro del límite

- **WHEN** el cliente adjunta un PDF de 2 MB
- **THEN** el archivo se guarda en `UPLOAD_DIR` y el correo se acepta

#### Scenario: Adjunto demasiado grande

- **WHEN** el cliente adjunta un archivo mayor a 25 MB
- **THEN** la solicitud se rechaza sin encolar el correo

#### Scenario: Demasiados adjuntos

- **WHEN** el cliente adjunta más de 10 archivos
- **THEN** la solicitud se rechaza sin encolar el correo

### Requirement: Registro y encolado del envío

Al aceptar una solicitud, el servicio SHALL crear un registro de auditoría (`EmailLog`) con el sistema, el buzón, el email del buzón como `from`, los destinatarios, asunto, cuerpo HTML, metadatos de los adjuntos (nombre original, tipo MIME, tamaño y ruta temporal) y estado `QUEUED`; SHALL encolar un trabajo en la cola `email-send` con el id del registro y las rutas de los adjuntos; y SHALL responder 200 con `{ message, emailLogId, status: "QUEUED" }`. El servicio MUST NOT verificar en este punto que el buzón tenga consentimiento OAuth2; esa condición se evalúa durante la entrega.

#### Scenario: Correo aceptado

- **WHEN** una solicitud válida de un sistema autenticado es aceptada
- **THEN** existe un `EmailLog` en estado `QUEUED`
- **AND** hay un trabajo en la cola `email-send` que referencia ese registro
- **AND** la respuesta es `{ "message": "Correo encolado correctamente", "emailLogId": "<id>", "status": "QUEUED" }`

#### Scenario: Buzón sin consentimiento

- **WHEN** el sistema envía desde un buzón activo que aún no completó el consentimiento OAuth2
- **THEN** el correo se acepta y encola, y su fallo se registra durante la entrega

### Requirement: Limpieza de adjuntos en solicitudes rechazadas

Cuando una solicitud de envío se rechaza después de haber recibido sus adjuntos, por cualquier motivo (validación de campos, remitente no autorizado, falta de buzón por defecto o error al registrar o encolar el correo), el servicio MUST eliminar los archivos temporales de esa solicitud antes de responder. Solo los adjuntos de solicitudes aceptadas y encoladas SHALL permanecer en `UPLOAD_DIR`.

#### Scenario: Remitente no autorizado con adjuntos

- **WHEN** un sistema envía dos adjuntos con un `from` que no le pertenece
- **THEN** la respuesta tiene estado 403
- **AND** ninguno de los dos archivos queda en `UPLOAD_DIR`

#### Scenario: Error de validación con adjuntos

- **WHEN** un sistema envía un adjunto y omite el campo `subject`
- **THEN** la respuesta tiene estado 400
- **AND** el archivo no queda en `UPLOAD_DIR`

#### Scenario: Solicitud aceptada

- **WHEN** un sistema envía una solicitud válida con un adjunto
- **THEN** el archivo permanece en `UPLOAD_DIR` hasta que el worker termina de procesar el correo
