## Context

La motivación está en `proposal.md`. Cómo funciona hoy:

- `EmailsService` guarda en `EmailLog.attachments` los metadatos `{ name: originalname, contentType: mimetype, size, path }` y encola `{ emailLogId, attachmentPaths }`.
- El worker ignora esos metadatos. `filesToBase64` toma el nombre y el tipo MIME de la **ruta en disco**, que es aleatoria.
- En NestJS, `FilesInterceptor` escribe los archivos en disco **antes** de que se ejecuten el `ValidationPipe` y el handler. Por eso los errores de validación también dejan archivos huérfanos.
- multer 2.1.1 usa busboy 1.6, que decodifica por defecto los parámetros `filename` como latin1, así que un nombre UTF-8 como `Pérez.pdf` llega como `PÃ©rez.pdf`.
- En el DTO, `cc`/`bcc` tienen `@IsString()` después de un `@Transform` que produce un arreglo.

## Goals / Non-Goals

**Goals:**
- Que el destinatario reciba los adjuntos con el nombre y el tipo correctos.
- Que no queden archivos en `UPLOAD_DIR` de solicitudes que no se encolaron.
- Que `cc`/`bcc` funcionen como ya dice el spec `email-submission`.

**Non-Goals:**
- Adjuntos grandes (más de ~3 MB) con sesiones de carga de Graph; queda para un change aparte.
- Limpiar archivos huérfanos ya existentes, o un barrido periódico de `UPLOAD_DIR`.
- Validar el contenido de los adjuntos (antivirus, tipos permitidos).

## Decisions

### D1. El worker usa los metadatos del `EmailLog`

El worker construye los adjuntos a partir de `EmailLog.attachments`: nombre, tipo declarado y ruta de cada uno. Si el registro no tiene metadatos pero el trabajo trae `attachmentPaths` (trabajos encolados antes del despliegue), se usa el comportamiento anterior: nombre tomado de la ruta y tipo por extensión. El trabajo sigue llevando `attachmentPaths` para no romper esa compatibilidad, y la limpieza usa las rutas de los metadatos o, en su defecto, las del trabajo.

*Alternativa descartada:* meter nombre y tipo en el payload del trabajo. Duplica información que ya está en el `EmailLog`, que es la fuente auditable.

### D2. Normalizar el nombre al recibir el archivo

En `EmailsService`, antes de guardar los metadatos, una función `normalizeAttachmentName` hace lo siguiente:

1. Corrige la decodificación latin1. La opción preferida es configurar en multer `defParamCharset: 'utf8'`, si multer 2.1.1 la expone (hay que verificarlo en la tarea 2.1). Si no, se recodifica `Buffer.from(name, 'latin1').toString('utf8')`, y solo se acepta el resultado si no contiene el carácter de reemplazo `U+FFFD`.
2. Toma el último segmento, separando tanto por `/` como por `\`.
3. Elimina los caracteres de control.
4. Si el nombre queda vacío, usa `adjunto` más la extensión, si existe.

Así el nombre ya queda corregido en el `EmailLog`, y la auditoría muestra lo mismo que recibe el destinatario.

**Resultado de la verificación (tarea 2.1):** multer 2.1.1 sí expone `defParamCharset`, y `FilesInterceptor` combina las opciones del módulo con las locales. Se configuró `defParamCharset: 'utf8'` en `multer.config.ts` y se descartó la recodificación heurística; una prueba de integración confirma que con `latin1` el nombre se deforma y con `utf8` llega intacto.

### D3. Tipo MIME con tres niveles

`resolveContentType(name, declared)` busca la extensión del nombre original en el mapa actual. Si no la encuentra, usa el tipo declarado cuando no está vacío. Como último recurso, `application/octet-stream`. El mapa por extensión va primero porque los clientes suelen declarar `application/octet-stream` aunque la extensión sea conocida.

### D4. Interceptor de limpieza ante errores

Un `CleanupUploadsOnErrorInterceptor`, registrado en `POST /emails/send` **después** de `FilesInterceptor`, envuelve `next.handle()` con `catchError`. Al recibir cualquier error, borra los archivos de `req.files` con `cleanupFiles` y relanza el error. Funciona porque en NestJS los pipes y el handler corren dentro de `next.handle()`, así que el interceptor ve tanto los errores de validación como los del servicio.

*Alternativas descartadas:*
- **`try/catch` en `EmailsService`:** no ve los errores del `ValidationPipe`.
- **Filtro de excepciones global:** mezcla la responsabilidad de limpiar archivos con el formato de errores y se aplicaría a todos los endpoints.

### D5. Fallo al encolar

Si `emailQueue.add` falla después de crear el `EmailLog`, el servicio marca ese registro como `FAILED` con un `errorMessage` y relanza el error; el interceptor borra los archivos. Así no quedan logs en `QUEUED` que nunca se van a procesar.

### D6. Corrección de `cc`/`bcc`

Se reemplaza `@IsString()` por `@IsArray()` y `@IsEmail({}, { each: true })`, igual que en `to`, y se mantiene `@IsOptional()`.

Además, al implementar se encontró que `parseJsonEmails` prueba primero la regex de email individual, y esa regex acepta como un solo email la cadena `["uno@correo.com"]` (solo tiene una `@`). Por eso un arreglo JSON con una sola dirección, el ejemplo documentado en Swagger, también se rechaza en `to`. Se invierte el orden: todo valor que empiece con `[` (tras quitar espacios) se interpreta como arreglo JSON, y solo los demás se prueban como email individual.

## Risks / Trade-offs

- **[La heurística latin1→UTF-8 deforma un nombre que ya venía bien decodificado]** → solo se aplica si el resultado no tiene `U+FFFD`, y la configuración de multer, si existe, hace innecesaria la heurística.
- **[Trabajos encolados antes del despliegue]** → el modo de compatibilidad (D1) los procesa como antes, con el nombre aleatorio. Es aceptable porque es solo un período corto.
- **[El interceptor borra archivos si el error ocurre después de encolar]** → en `EmailsService`, encolar es la última operación, así que tras un encolado exitoso no puede haber error. Las pruebas deben cubrir este orden.

## Migration Plan

Despliegue normal, sin migración de base de datos. Para hacer rollback basta revertir el código: los trabajos encolados con la versión nueva siguen trayendo `attachmentPaths`, que la versión anterior entiende.
