## Context

El estado actual y los problemas están en `proposal.md`. Restricciones que condicionan el diseño:

- `/auth/consent` y `/auth/callback` se abren desde un navegador, así que no pueden llevar cabeceras de autenticación.
- El envío usa `/me/sendMail` con un token delegado: la cuenta que otorga el consentimiento **es** el remitente real, sin importar el email registrado en el buzón.
- El App Registration es multi-tenant (endpoint `/common`) y acepta cuentas de trabajo y personales.
- `AdminGuard` es global y se activa con `@RequireAdmin()`. Prisma 7 se usa con el adapter `pg`.
- Ya hay buzones en producción con tokens en texto plano. Se decidió conservarlos (cifrados), sin forzar un nuevo consentimiento.

## Goals / Non-Goals

**Goals:**
- Que solo el propietario real de un buzón pueda vincular tokens a él, y solo con la intervención del administrador.
- Que los tokens no se puedan leer en la base de datos, en las respuestas de la API ni en los logs.
- Desplegar sin interrumpir los envíos de los buzones ya autorizados.

**Non-Goals:**
- Rotar la clave de cifrado, o usar un KMS o un vault externo.
- Aceptar alias (proxy addresses) del buzón como identidad válida.
- Buzones compartidos o "enviar como" otra cuenta (`/users/{id}/sendMail`).
- Revocar los tokens del lado de Microsoft cuando se revoca el consentimiento local.

## Decisions

### D1. Solicitudes de consentimiento persistidas (`ConsentRequest`)

Nueva tabla `ConsentRequest`: `id`, `mailboxId` (FK con cascade), `tokenHash` (único), `state` (único, nulo hasta abrir el enlace), `expiresAt`, `usedAt`, `createdAt`.

- **Emitir enlace:** dentro de una transacción se borran las solicitudes **no usadas** del buzón y se crea una nueva con un token aleatorio de 32 bytes (base64url). Solo se guarda su SHA-256; con 256 bits de entropía no hace falta bcrypt.
- **Abrir el enlace** (`/auth/consent?token=`): se busca la solicitud por hash, se valida que esté vigente, que no se haya usado y que el buzón exista. Se genera un `state` aleatorio nuevo y se guarda en la solicitud, reemplazando el anterior para que solo valga el último intento.
- **Callback:** se busca la solicitud por `state` antes de contactar a Microsoft. `usedAt` se marca solo cuando el consentimiento termina bien, así un fallo de identidad permite reintentar con el mismo enlace.

*Alternativas descartadas:*
- **Enlace firmado sin estado (HMAC/JWT):** no permite invalidar enlaces anteriores ni garantizar un solo uso sin otra tabla.
- **Guardar el `state` en Redis con TTL:** es menos auditable y reparte el estado entre dos almacenes.

### D2. URL del enlace derivada de `REDIRECT_URI`

La URL es `new URL('/auth/consent', REDIRECT_URI)` más `?token=`. Se evita una variable nueva, porque `REDIRECT_URI` ya es la URL pública del servicio registrada en Azure.

*Alternativa:* una variable `PUBLIC_BASE_URL`. Solo hace falta si el servicio se publica bajo un prefijo de ruta distinto al del callback.

### D3. Identidad de la cuenta vía `id_token`

Se agregan los scopes `openid email profile` en la autorización y en el intercambio del código. La respuesta trae un `id_token`, del que se decodifica el payload **sin validar la firma**: llega directo del token endpoint por TLS, caso que OIDC Core §3.1.3.7 permite. Los candidatos de identidad son los claims `email`, `preferred_username` y `upn`. La identidad es válida si alguno coincide con el email del buzón, sin distinguir mayúsculas. Si no viene `id_token`, se rechaza.

El refresh mantiene el scope actual (`Mail.Send offline_access`), para no arriesgar la renovación de los refresh tokens heredados que se emitieron sin `openid`.

*Alternativa descartada:* llamar a `GET /me` de Graph. Requiere el permiso `User.Read` y una petición extra, y no aporta más que los claims.

### D4. Cifrado AES-256-GCM con clave de entorno

`TokenCipher` (en `src/common/crypto/`) usa `node:crypto` con AES-256-GCM, un IV aleatorio de 12 bytes y el formato `enc:v1:<iv>:<tag>:<ciphertext>` en base64. La clave se lee de `TOKEN_ENCRYPTION_KEY` (32 bytes en base64) y se valida en `onModuleInit`; si falta o es inválida, el arranque falla.

- Toda escritura se cifra.
- Al leer, un valor sin el prefijo `enc:v1:` se trata como heredado en texto plano: se usa y se emite un warning sin el valor. Esto cubre la ventana entre el despliegue y la ejecución del script de migración.

*Alternativas descartadas:*
- **`pgcrypto`:** la clave viajaría en las consultas SQL y podría aparecer en logs de Postgres.
- **KMS:** fuera de alcance para esta infraestructura.

### D5. Omitir tokens por defecto en Prisma

Se configura el `omit` global del cliente Prisma en `PrismaService` para `mailbox.accessToken` y `mailbox.refreshToken`. Solo `AuthService` los pide explícitamente con `omit: { accessToken: false, refreshToken: false }`. Así la seguridad no depende de que cada endpoint recuerde quitar campos.

*Alternativa descartada:* destructurar en cada método de `MailboxesService`, como se hace hoy con `apiKeyHash`. Es fácil olvidarlo en un endpoint nuevo.

### D6. Ubicación del endpoint de emisión

`POST /mailboxes/:id/consent-link` vive en `AuthController` con `@RequireAdmin()`, porque es parte del flujo de consentimiento y usa `AuthService`. Responde 404 si el buzón no existe y 400 si está inactivo.

### D7. Página HTML del callback

Se agrega un helper `escapeHtml` que se aplica a `title` y `message` en `renderResult`. En una discrepancia de identidad, la página muestra la cuenta esperada y la identificada, ambas escapadas.

### D8. Revocación al cambiar el email

En `MailboxesService.update`, si `dto.email` difiere del actual (sin distinguir mayúsculas), dentro de una transacción se ponen `accessToken`, `refreshToken` y `tokenExpiresAt` en `null` y `consentGiven = false`, y se borran las `ConsentRequest` no usadas del buzón.

### D9. El callback no toca `active`

Se elimina `active: true` del update del callback.

## Risks / Trade-offs

- **[El UPN o el email de la cuenta no coincide con el email registrado, por ejemplo un alias]** → el consentimiento legítimo se rechaza. *Mitigación:* la página muestra la cuenta identificada; el administrador corrige el email del buzón (antes de autorizar no hay tokens que perder) y emite un enlace nuevo.
- **[Se pierde `TOKEN_ENCRYPTION_KEY`]** → todos los tokens quedan ilegibles y cada buzón debe autorizarse de nuevo. *Mitigación:* documentar en el README que la clave se respalda junto con los secretos de Azure.
- **[Un enlace se filtra dentro de sus 24 h]** → quien lo use con otra cuenta no pasa la verificación de identidad (D3), así que solo puede consentir el propietario real.
- **[Los buzones heredados nunca verificaron su identidad]** → se aceptó el riesgo; el script de migración lista los buzones autorizados para que el administrador los revise y emita enlaces nuevos donde haya dudas.
- **[Hacer rollback a la versión anterior]** → esa versión no entiende tokens cifrados. *Mitigación:* el script de migración tiene modo `--decrypt`.

## Migration Plan

1. Generar la clave con `openssl rand -base64 32` y guardarla como `TOKEN_ENCRYPTION_KEY` en el entorno, con respaldo.
2. Agregar `openid`, `email` y `profile` a los permisos delegados del App Registration, si el tenant los exige explícitamente.
3. Aplicar la migración de Prisma (tabla `ConsentRequest`).
4. Desplegar el código. Los buzones heredados siguen enviando gracias a la lectura tolerante (D4).
5. Ejecutar `npm run tokens:encrypt`. Es idempotente: cifra los tokens que aún estén en texto plano e imprime los buzones con `consentGiven = true` para revisarlos.
6. Avisar a los administradores que los enlaces `/auth/consent?mailboxId=` dejan de funcionar y que ahora se generan con `POST /mailboxes/:id/consent-link`.

**Rollback:** ejecutar `npm run tokens:encrypt -- --decrypt`, desplegar la versión anterior y revertir la migración. La tabla `ConsentRequest` puede quedarse sin afectar a la versión anterior.

## Open Questions

- ¿El tiempo de vida del enlace (24 h) debe ser configurable por variable de entorno? Se puede agregar después sin cambiar el spec.
