## 1. Destinatarios en copia

- [x] 1.1 Reproducir el rechazo de `cc`/`bcc` con una prueba del `ValidationPipe` sobre `SendEmailDto`
- [x] 1.2 Reemplazar `@IsString()` por `@IsArray()` y `@IsEmail({}, { each: true })` en `cc` y `bcc`, e interpretar como arreglo JSON todo valor que empiece con `[` antes de probarlo como email individual (D6)
- [x] 1.3 Pruebas de `to`, `cc` y `bcc`: email individual, arreglo JSON, email inválido en la lista, formato no reconocido, campo ausente

## 2. Nombres de adjuntos

- [x] 2.1 Verificar si multer 2.1.1 acepta `defParamCharset: 'utf8'` y, si es así, configurarlo en `multer.config.ts` y en el `FilesInterceptor` del endpoint
- [x] 2.2 Implementar `normalizeAttachmentName`: corrección latin1→UTF-8 si hace falta, último segmento de la ruta con `/` y `\`, sin caracteres de control, y `adjunto` como respaldo (D2)
- [x] 2.3 Usar el nombre normalizado en los metadatos que `EmailsService` guarda en `EmailLog.attachments`
- [x] 2.4 Pruebas de `normalizeAttachmentName`: nombre simple, con acentos y `ñ`, con ruta Windows, con ruta relativa, vacío

## 3. Entrega de adjuntos

- [x] 3.1 Implementar `resolveContentType(name, declared)` con extensión, tipo declarado y `application/octet-stream` como respaldo (D3)
- [x] 3.2 Cambiar `EmailProcessor` y `attachment.utils.ts` para construir los adjuntos desde `EmailLog.attachments`, usando `attachmentPaths` del trabajo como respaldo para trabajos antiguos; la limpieza usa las mismas rutas (D1)
- [x] 3.3 Pruebas del worker: nombre original y tipo MIME correctos en el cuerpo enviado a Graph; trabajo antiguo sin metadatos

## 4. Limpieza ante rechazos

- [x] 4.1 Crear `CleanupUploadsOnErrorInterceptor`, que borra `req.files` cuando `next.handle()` falla y relanza el error (D4)
- [x] 4.2 Registrarlo en `POST /emails/send` después de `FilesInterceptor`
- [x] 4.3 En `EmailsService`, si falla el encolado, marcar el `EmailLog` como `FAILED` con `errorMessage` y relanzar (D5)
- [x] 4.4 Pruebas: remitente no autorizado con adjuntos (403, sin archivos), `subject` ausente con adjunto (400, sin archivos), sin buzón por defecto (400, sin archivos), solicitud aceptada (el archivo permanece)

## 5. Verificación

- [ ] 5.1 Prueba manual contra un buzón real: enviar con `cc`, `bcc` y un adjunto `Constancia_Pérez_Muñoz.pdf`, y confirmar el nombre y el tipo en el correo recibido
- [x] 5.2 Agregar al README ejemplos de envío con `cc`/`bcc`
