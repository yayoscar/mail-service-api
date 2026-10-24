## ADDED Requirements

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

## MODIFIED Requirements

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
