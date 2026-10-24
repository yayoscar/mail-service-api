## 1. Prerrequisitos

- [x] 1.1 Confirmar que `harden-oauth-consent` está implementado (respuestas de buzones sin tokens y `POST /mailboxes/:id/consent-link` disponible); si no, detener este change
- [x] 1.2 Agregar las dependencias `@nestjs/serve-static`, `@nestjs/jwt`, `@nestjs/throttler`, `cookie-parser` y `@types/cookie-parser`
- [x] 1.3 Agregar `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` y `ADMIN_SESSION_SECRET` a `.env.example`

## 2. Publicación de la interfaz y build

- [x] 2.1 Crear `admin-ui/` (Vue 3, vue-router, Vite con `base: '/admin/'` y salida en `../dist/admin-ui`, Tailwind 4, DaisyUI 5) y excluirla en `tsconfig.json` y `tsconfig.build.json`
- [x] 2.2 Registrar `ServeStaticModule` en `/admin` con la ruta resuelta desde `__dirname`, omitiéndolo con un warning si no existe `index.html`; verificar el fallback de rutas profundas con Express 5 y, si falla, usar el controlador alternativo (D2)
- [x] 2.3 Ajustar los scripts raíz: `build` = `nest build` y luego el build de `admin-ui`; agregar `dev:admin` con el proxy de Vite hacia `localhost:3002`
- [x] 2.4 Prueba de integración: `/admin` y `/admin/sistemas/x` devuelven `index.html`; `/systems` y `/emails/send` responden como antes

## 3. Sesión del administrador

- [x] 3.1 Crear `AdminSessionConfig`: lee y valida las tres variables, expone `enabled` y emite un warning solo con los nombres de las variables faltantes o inválidas (D4)
- [x] 3.2 Implementar `POST /admin-session/login` con comparación en tiempo uniforme, 401 genérico, 400 por campos faltantes, 503 si no está configurado, y log del intento fallido sin credenciales (D6)
- [x] 3.3 Emitir y verificar el JWT de 8 h en la cookie `mail_admin_session` (`httpOnly`, `SameSite=Strict`, `Path=/`, `Secure` según `req.secure`), exigiendo que `sub` coincida con `ADMIN_USERNAME` (D5)
- [x] 3.4 Implementar `GET /admin-session/me` y `POST /admin-session/logout`
- [x] 3.5 Aplicar `ThrottlerGuard` a `login` con 5 intentos por 60 s (D7)
- [x] 3.6 Configurar `cookie-parser` y `trust proxy` en `main.ts`
- [x] 3.7 Crear `npm run admin:hash` (`scripts/admin-hash.mjs`) según D11
- [x] 3.8 Pruebas de sesión: credenciales correctas, contraseña incorrecta, usuario inexistente con respuesta idéntica, campos faltantes, configuración incompleta (503, el resto del API sigue funcionando), hash inválido, secreto corto, sexto intento (429), cookie caducada, alterada y firmada con otro secreto, logout, y ausencia de credenciales en logs y respuestas

## 4. Control de acceso

- [x] 4.1 Extender `AdminGuard` con la secuencia de D8: cabecera primero (incorrecta = 401 aunque haya sesión), luego cookie, y luego `X-Admin-UI` en métodos que modifican datos
- [x] 4.2 Pruebas del guard: API key válida, ausente e incorrecta; sesión válida en `GET`; sesión con `POST` sin `X-Admin-UI` (403, sin cambios); sesión con `POST` y la cabecera; API key incorrecta con sesión válida; script con API key sin `X-Admin-UI`

## 5. Ajustes en buzones

- [x] 5.1 Agregar `includeInactive` a `GET /systems/:systemId/mailboxes` con un DTO de consulta y documentarlo en Swagger (D9)
- [x] 5.2 Rechazar en `MailboxesService.update` el `active: false` sobre el buzón por defecto
- [x] 5.3 Pruebas: listado por defecto, listado con inactivos, `PATCH` que desactiva el buzón por defecto (400, sigue activo) y reactivación con `PATCH active: true`

## 6. Interfaz: base

- [x] 6.1 Implementar `api.ts`: mismo origen, `X-Admin-UI: 1`, desempaquetar `{ success, data }`, mensajes de error del API y aviso de sesión terminada ante un 401
- [x] 6.2 Implementar el router con base `/admin/` y un guard que consulta `/admin-session/me`
- [x] 6.3 Implementar `LoginPage` con los mensajes para 401, 429 y 503, y el layout con la opción de cerrar sesión

## 7. Interfaz: sistemas

- [x] 7.1 `SystemsPage`: lista de todos los sistemas con key, nombre y estado
- [x] 7.2 Alta de sistema con `SystemForm`, mostrando la API key en `SecretDialog` (copiar y advertir) y conservando el formulario si el API devuelve un error
- [x] 7.3 Editar el nombre, activar o desactivar con `ConfirmDialog`, y rotar la API key con confirmación y `SecretDialog`

## 8. Interfaz: buzones

- [x] 8.1 `SystemDetailPage`: lista con `includeInactive=true` que muestra email, nombre, ★ por defecto, activo y consentimiento (`Autorizado`/`Pendiente`)
- [x] 8.2 Agregar y editar con `MailboxForm`, advirtiendo antes de cambiar el email de un buzón autorizado
- [x] 8.3 Acciones: marcar por defecto, desactivar (oculto para el buzón por defecto) y reactivar
- [x] 8.4 `ConsentLinkDialog`: generar el enlace advirtiendo que invalida los anteriores, y mostrar URL, expiración, botón de copiar y "Abrir en pestaña nueva"

## 9. Verificación y documentación

- [ ] 9.1 Revisar en el navegador que ni `localStorage`, ni `sessionStorage`, ni las cookies legibles por JavaScript contengan credenciales tras crear un sistema y rotar su clave
- [ ] 9.2 Prueba manual completa: login, alta de sistema, alta de buzón, enlace de consentimiento, autorización, rotación de clave, desactivación y reactivación, cierre de sesión y sesión caducada
- [x] 9.3 Documentar en el README la interfaz `/admin`, las variables nuevas, `npm run admin:hash`, cómo escapar `$` fuera de `.env`, `dev:admin` y el ajuste de `trust proxy`
