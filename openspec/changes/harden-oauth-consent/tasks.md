## 1. Datos y configuración

- [x] 1.1 Agregar el modelo `ConsentRequest` (`id`, `mailboxId` con cascade, `tokenHash` único, `state` único nullable, `expiresAt`, `usedAt`, `createdAt`) en `prisma/schema.prisma` y generar la migración
- [x] 1.2 Agregar `TOKEN_ENCRYPTION_KEY` a `.env.example` y documentarla en el README (cómo generarla y que debe respaldarse)
- [x] 1.3 Configurar el `omit` global de Prisma en `PrismaService` para `mailbox.accessToken` y `mailbox.refreshToken` (D5)

## 2. Cifrado de tokens

- [x] 2.1 Crear `TokenCipher` en `src/common/crypto/` con AES-256-GCM, formato `enc:v1:<iv>:<tag>:<ciphertext>`, lectura tolerante de valores heredados sin prefijo (con warning sin el valor) y validación de la clave en `onModuleInit` (D4)
- [x] 2.2 Pruebas unitarias de `TokenCipher`: ida y vuelta, rechazo de un texto cifrado alterado, valor heredado sin prefijo, clave ausente o de longitud incorrecta

## 3. Enlaces de consentimiento

- [x] 3.1 Implementar `POST /mailboxes/:id/consent-link` en `AuthController` con `@RequireAdmin()`: borra las solicitudes no usadas del buzón, crea una nueva con token aleatorio (se guarda solo su SHA-256) y devuelve `url` y `expiresAt` a 24 h; responde 404 si el buzón no existe y 400 si está inactivo (D1, D2, D6)
- [x] 3.2 Reescribir `GET /auth/consent` para recibir `token`: validar que exista, esté vigente, no esté usado y el buzón exista; generar y guardar un `state` aleatorio; redirigir con los scopes `Mail.Send offline_access openid email profile` y `login_hint`; en caso contrario, página de error 400 sin redirigir
- [x] 3.3 Actualizar la documentación Swagger de ambos endpoints

## 4. Callback

- [x] 4.1 Buscar la `ConsentRequest` por `state` antes de intercambiar el código; si no existe, caducó o ya se usó, responder con la página de error 400 sin contactar a Microsoft
- [x] 4.2 Intercambiar el código con los scopes nuevos, decodificar el payload del `id_token` y comparar `email`/`preferred_username`/`upn` con el email del buzón sin distinguir mayúsculas; si no coincide, página de error con la cuenta esperada y la identificada (D3)
- [x] 4.3 En una transacción: guardar los tokens cifrados, `tokenExpiresAt`, `consentGiven = true` y marcar `usedAt`, sin modificar `active` (D9)
- [x] 4.4 Agregar `escapeHtml` y aplicarlo a todo el contenido dinámico de `renderResult` (D7)

## 5. Uso de los tokens

- [x] 5.1 Adaptar `getValidAccessToken` y `refreshAccessToken` para pedir explícitamente los tokens (omit en false), descifrarlos al leer y cifrarlos al guardar; mantener el scope del refresh en `Mail.Send offline_access`
- [x] 5.2 Eliminar el log `Token prefix` de `GraphMailService` y revisar que ningún otro log incluya tokens ni respuestas completas del token endpoint

## 6. Gestión de buzones

- [x] 6.1 En `MailboxesService.update`, cuando el email cambie (sin distinguir mayúsculas), limpiar tokens y `tokenExpiresAt`, poner `consentGiven = false` y borrar las `ConsentRequest` no usadas, todo en una transacción (D8)
- [x] 6.2 Verificar que las respuestas de crear, listar, actualizar, desactivar y marcar como default un buzón no incluyan `accessToken` ni `refreshToken` e incluyan `consentGiven`

## 7. Migración de datos

- [x] 7.1 Crear un script idempotente que cifre los tokens heredados en texto plano, liste los buzones con `consentGiven = true` y soporte `--decrypt` para el rollback
- [x] 7.2 Registrarlo como `npm run tokens:encrypt` y documentar en el README el procedimiento de despliegue y rollback

## 8. Verificación

- [x] 8.1 Pruebas del flujo de consentimiento: enlace vigente, caducado, usado, reemplazado por uno nuevo, sin token y con `mailboxId`; `state` desconocido o reutilizado; cuenta distinta; diferencia solo en mayúsculas; `error_description` con HTML; buzón desactivado tras emitir el enlace
- [x] 8.2 Prueba de que cambiar el email revoca el consentimiento y cambiar solo `displayName` no lo hace
- [ ] 8.3 Prueba manual de punta a punta contra un tenant real: emitir enlace, consentir con la cuenta correcta, consentir con otra cuenta, enviar un correo y confirmar que los tokens están cifrados en la base de datos
- [x] 8.4 Actualizar el paso 3 ("Autorizar el buzón") del README con el nuevo flujo de enlaces
