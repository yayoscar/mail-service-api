## Context

La motivación y el alcance están en `proposal.md`. Lo que condiciona el diseño:

- Ya se decidió un solo artefacto: NestJS sirve la interfaz y el API en el mismo proceso y el mismo origen. El administrador único se define en `.env`.
- `AdminGuard` es global (`APP_GUARD`) y se activa con `@RequireAdmin()`. Hoy solo acepta `x-admin-api-key`.
- `nest-cli.json` tiene `deleteOutDir: true`: `nest build` borra `dist/` completo. `tsconfig.json` no tiene `include`, así que compilaría cualquier `.ts` del repositorio.
- `@nestjs/platform-express` usa Express 5, que cambia la sintaxis de los comodines de las rutas (path-to-regexp 8).
- `main.ts` habilita CORS para cualquier origen y sin credenciales.
- Este change se apoya en `harden-oauth-consent` (tokens ocultos y endpoint de enlaces de consentimiento), que debe implementarse antes.

## Goals / Non-Goals

**Goals:**
- Que el administrador gestione sistemas y buzones desde el navegador sin conocer la `ADMIN_API_KEY`.
- Mantener el API sin cambios para los sistemas consumidores y para los scripts que usan `x-admin-api-key`.
- Seguir teniendo un solo build y un solo proceso.

**Non-Goals:**
- Varios administradores, roles o un registro de acciones por usuario.
- Cambiar la contraseña desde la interfaz, o una autenticación de dos factores.
- Sesiones revocables una por una (la revocación es global, rotando el secreto).
- Restringir CORS: con origen `*` y sin credenciales, el navegador no envía la cookie en peticiones de otros orígenes que lean respuestas.
- Dashboard, auditoría y cualquier otra pantalla fuera de la administración de cuentas.

## Decisions

### D1. Proyecto `admin-ui/` separado dentro del repositorio

`admin-ui/` tiene su propio `package.json`, con Vue 3, vue-router, Vite, Tailwind 4 y DaisyUI 5, el mismo stack visual que `control-gestion`. Vite compila con `base: '/admin/'` hacia `dist/admin-ui/`.

- El script raíz `build` ejecuta primero `nest build` y después `npm --prefix admin-ui run build`, porque `deleteOutDir` borraría la UI si fuera al revés.
- Se agrega `admin-ui` al `exclude` de `tsconfig.json` y de `tsconfig.build.json`, para que ni Nest ni el linter del API la procesen.
- En desarrollo, `npm --prefix admin-ui run dev` levanta Vite con un proxy hacia `localhost:3002` para `/systems`, `/mailboxes` y `/admin-session`. Así el navegador ve un solo origen y la cookie funciona igual que en producción.

*Alternativas descartadas:*
- **Un solo `package.json`:** mezcla dependencias de frontend con las del API y complica el `tsconfig`.
- **Nuxt con `ssr:false`:** sin su servidor no aporta nada sobre Vite, y agrega configuración.

### D2. Publicación con `@nestjs/serve-static`

`ServeStaticModule.forRoot({ rootPath: <dist>/admin-ui, serveRoot: '/admin' })` sirve los archivos estáticos y devuelve `index.html` para cualquier ruta de `/admin/*` que no sea un archivo. La ruta se resuelve relativa al archivo compilado (`__dirname`) y no al directorio de trabajo, para que funcione igual sin importar desde dónde lo arranque el servicio de systemd.

Si `dist/admin-ui/index.html` no existe (por ejemplo, al desarrollar solo el API), el módulo no se registra y se emite un warning; el API arranca igual.

Hay que verificar el comportamiento del fallback con Express 5 (tarea 2.2). Si `renderPath` no funciona con la nueva sintaxis, se usa un controlador mínimo `GET /admin/{*path}` que envía `index.html`.

### D3. Endpoints de sesión fuera de `/admin`

`AdminSessionController` vive en `/admin-session` (`login`, `logout`, `me`), fuera de `/admin`, para que nunca choque con el fallback de la SPA.

### D4. Configuración validada al arrancar, sin bloquear el arranque

`AdminSessionConfig` lee `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` y `ADMIN_SESSION_SECRET` en `onModuleInit`. El hash se valida con la forma de bcrypt (`$2a/$2b/$2y`, costo y 53 caracteres) y el secreto debe tener al menos 32 caracteres. Si algo falla, expone `enabled = false` y emite un warning con los **nombres** de las variables; en ese estado, `login` responde 503.

Los hashes bcrypt contienen `$`. `@nestjs/config` no expande variables por defecto, así que el `.env` funciona tal cual. En shells o en un `env_file` de compose el valor debe ir entre comillas simples o con `$$`. Se documenta en el README.

### D5. Sesión sin estado: JWT HS256 en una cookie `httpOnly`

Se usa `@nestjs/jwt` con `ADMIN_SESSION_SECRET`. El payload lleva `sub` (el usuario) y `exp` a 8 h. La cookie se llama `mail_admin_session` y tiene los atributos `httpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=28800`, y `Secure` cuando `req.secure` es verdadero. Al verificar la cookie también se exige que `sub` coincida con el `ADMIN_USERNAME` actual, así que cambiar el usuario invalida las sesiones existentes.

Se agrega `cookie-parser` en `main.ts`, junto con `app.set('trust proxy', 'loopback, linklocal, uniquelocal')`. Con eso, `req.secure` y `req.ip` respetan las cabeceras de un proxy inverso en la misma máquina o en la red privada, sin confiar en las que llegan de internet.

*Alternativas descartadas:*
- **`express-session` + `connect-redis`:** permite revocar sesiones una por una y expirar por inactividad, pero agrega un store, la serialización de sesiones y más dependencias para un solo usuario.
- **Cookie cifrada con iron:** no aporta nada aquí, porque el payload no contiene secretos.

### D6. Inicio de sesión con tiempo uniforme

Los usuarios se comparan con `timingSafeEqual` sobre sus digests SHA-256, que siempre tienen la misma longitud. `bcrypt.compare(password, ADMIN_PASSWORD_HASH)` se ejecuta **siempre**, aunque el usuario no coincida. El resultado es `usuarioOk && passwordOk`, y si es falso se responde el 401 genérico. Se registra en el log `Intento de inicio de sesión fallido desde <ip>`, sin el usuario ni la contraseña.

### D7. Límite de intentos con `@nestjs/throttler`

Se aplica `ThrottlerGuard` solo a `POST /admin-session/login`, con un límite de 5 intentos por 60 segundos y almacenamiento en memoria. Como el servicio es un solo proceso, no hace falta Redis. Si algún día se escala a varias instancias, el almacenamiento debe pasar a Redis.

### D8. `AdminGuard` con dos credenciales

```
¿Ruta con @RequireAdmin? ── no ──▶ permitir
        │ sí
¿Trae x-admin-api-key? ── sí ──▶ validar como hoy (si es incorrecta: 401, aunque haya sesión)
        │ no
¿Cookie de sesión válida? ── no ──▶ 401 "Header x-admin-api-key es requerido"
        │ sí
¿Método distinto de GET/HEAD/OPTIONS y sin X-Admin-UI: 1? ── sí ──▶ 403
        │ no
     permitir
```

El guard recibe por inyección el verificador de sesión del `AdminSessionModule`. La cabecera `X-Admin-UI` funciona como defensa contra CSRF porque un sitio externo no puede enviar cabeceras personalizadas con credenciales sin un preflight de CORS, que falla mientras CORS no permita credenciales. A eso se suma `SameSite=Strict`.

### D9. Ajustes en buzones

- **`includeInactive`:** `GET /systems/:systemId/mailboxes` acepta el parámetro de consulta `includeInactive`, validado como booleano con un DTO. Sin el parámetro, el comportamiento es el actual.
- **Desactivación por `PATCH`:** `MailboxesService.update` rechaza `active: false` sobre el buzón por defecto con el mismo mensaje que `deactivate`.

### D10. Estructura de la interfaz

```
admin-ui/src/
├─ api.ts            fetch con credentials:'same-origin', X-Admin-UI: 1,
│                    desenvuelve { success, data }; 401 → evento de sesión terminada
├─ router.ts         history con base /admin/; guard que consulta /admin-session/me
├─ pages/            LoginPage · SystemsPage · SystemDetailPage (buzones)
└─ components/       SystemForm · MailboxForm · ConfirmDialog · SecretDialog (API key
                     una vez) · ConsentLinkDialog
```

No se usa una librería de estado: con tres pantallas y listas pequeñas, cada página carga sus datos. Las API keys y los enlaces solo viven en el estado del componente del diálogo y se descartan al cerrarlo.

### D11. Comando para generar el hash

`npm run admin:hash` ejecuta `scripts/admin-hash.mjs`, que pide la contraseña dos veces sin mostrarla, exige al menos 12 caracteres e imprime el hash bcrypt con costo 12, listo para pegar en `.env`.

## Risks / Trade-offs

- **[Alguien roba la cookie]** → con una sesión sin estado, la cookie es válida hasta que expira. *Mitigación:* `httpOnly` impide leerla desde JavaScript, la vida máxima es de 8 h y rotar `ADMIN_SESSION_SECRET` revoca todas las sesiones.
- **[`trust proxy` mal ajustado al despliegue real]** → `req.ip` sería siempre la IP del proxy (un solo contador de intentos para todos) o la cookie no llevaría `Secure`. *Mitigación:* el valor es configurable y se documenta según la topología.
- **[El límite de intentos vive en memoria]** → se reinicia al reiniciar el servicio. Es aceptable con un solo proceso.
- **[Se implementa antes que `harden-oauth-consent`]** → los tokens llegarían al navegador. *Mitigación:* la tarea 1.1 bloquea el change hasta que ese otro esté aplicado.
- **[Express 5 y el fallback de la SPA]** → hay un plan B con un controlador propio (D2).
- **[El build tarda más]** → se compilan dos proyectos. Es aceptable a cambio de seguir con un solo artefacto.

## Migration Plan

1. Implementar y desplegar antes `harden-oauth-consent`.
2. Generar el hash con `npm run admin:hash` y el secreto con `openssl rand -base64 48`.
3. Definir `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` y `ADMIN_SESSION_SECRET` en el entorno de producción.
4. Desplegar el nuevo build (`npm run build`, que incluye `dist/admin-ui`) y reiniciar el servicio de systemd (`systemctl restart`). Ver `docs/ACTUALIZACION-PRODUCCION.md`.
5. Si el servicio está detrás de un proxy, confirmar que `/admin` se publica por HTTPS.

**Rollback:** desplegar el build anterior. Las variables nuevas pueden quedarse, porque la versión anterior las ignora. No hay cambios de base de datos.

## Open Questions

- ¿El servicio en producción se publica detrás de nginx u otro proxy, y en qué red? Define el valor final de `trust proxy`; se puede ajustar sin cambiar specs ni tareas.
