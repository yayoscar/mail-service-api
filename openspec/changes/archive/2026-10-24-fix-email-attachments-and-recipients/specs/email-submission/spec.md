## ADDED Requirements

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
