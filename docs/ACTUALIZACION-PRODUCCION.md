# Actualización de producción

Guía para actualizar una instalación de producción **que ya está funcionando**, con su `.env` configurado y el servicio corriendo como daemon de systemd, a la versión que incluye:

- **Seguridad del consentimiento OAuth2** (`harden-oauth-consent`): enlaces de consentimiento emitidos por el administrador, verificación de la cuenta y tokens cifrados.
- **Correcciones de envío** (`fix-email-attachments-and-recipients`): `cc`/`bcc`, nombres originales de los adjuntos y limpieza de archivos temporales.
- **Interfaz de administración** (`add-admin-ui`) en `/admin`, con un único administrador.

Los ejemplos usan estos valores; sustitúyelos por los de tu servidor:

| Valor del ejemplo | Qué es |
|---|---|
| `/opt/mail-service-api` | Directorio del repositorio en el servidor (`WorkingDirectory` del servicio) |
| `mail-service` | Nombre de la unidad de systemd (`mail-service.service`) |
| `mailsvc` | Usuario del sistema con el que corre el servicio |
| `https://correo.dgeti.gob.mx` | URL pública del servicio |

---

## 1. Qué cambia para cada quien

| Quién | Qué cambia | ¿Requiere acción? |
|---|---|---|
| **Sistemas que envían correo** (`POST /emails/send`) | `cc` y `bcc` empiezan a funcionar; un arreglo JSON con un solo destinatario (`["a@b.com"]`) ya se acepta; los adjuntos llegan con su nombre original | No; el contrato del API no cambia |
| **Administradores** | `GET /auth/consent?mailboxId=...` **deja de funcionar**. Los enlaces se generan con `POST /mailboxes/:id/consent-link` o desde `/admin` | Sí: avisar a quien autoriza buzones |
| **Propietarios de buzones** | Deben iniciar sesión con la cuenta del buzón; con otra cuenta se rechaza | Solo al autorizar un buzón nuevo o al volver a autorizar uno existente |
| **Respuestas de buzones en el API** | Ya no incluyen `accessToken` ni `refreshToken` | Solo si algún script los leía (no debería) |
| **Operación** | Tres variables nuevas obligatorias o recomendadas, una migración de base de datos y un script de cifrado | Sí: esta guía |

---

## 2. Antes de empezar

- [ ] **Node.js ≥ 20.19 o ≥ 22.12** en el servidor (`node -v`). La interfaz se compila con Vite 8, que no funciona con versiones anteriores.
- [ ] **Respaldo de la base de datos:**
  ```bash
  pg_dump -Fc -d "$DATABASE_URL" -f mail_service_$(date +%Y%m%d_%H%M).dump
  ```
- [ ] **Respaldo del `.env` actual:**
  ```bash
  sudo cp /opt/mail-service-api/.env /opt/mail-service-api/.env.bak.$(date +%Y%m%d)
  ```
- [ ] **Anotar el commit actual**, para un posible rollback:
  ```bash
  cd /opt/mail-service-api && git rev-parse HEAD
  ```
- [ ] **Ventana de mantenimiento:** el servicio se reinicia una vez. Los correos que lleguen mientras está detenido fallan del lado del sistema consumidor; los que ya están en la cola de Redis se procesan al volver.

---

## 3. Azure (Entra ID)

En **entra.microsoft.com → Registros de aplicaciones → la aplicación del servicio**:

1. **Permisos de API** → **Agregar un permiso** → **Microsoft Graph** → **Permisos delegados** → sección **OpenId**: marca `openid`, `email` y `profile` y agrégalos. La lista final debe tener `Mail.Send`, `offline_access`, `openid`, `email` y `profile`, todos de tipo delegado.
   Sin estos permisos, Microsoft no devuelve la identidad de la cuenta y **ningún buzón podrá autorizarse**.
2. Si el tenant tiene deshabilitado el consentimiento de usuario: **Conceder consentimiento de administrador**.
3. **Autenticación**: confirma que la URI de redirección de producción (la de `REDIRECT_URI`, por ejemplo `https://correo.dgeti.gob.mx/auth/callback`) está registrada como tipo **Web**.
4. Recomendado: **Configuración de token** → **Agregar notificación opcional** → tipo **Id** → `email` y `upn`.

No hace falta cambiar el client ID ni el secreto.

---

## 4. Variables nuevas en el `.env`

Agrega estas cuatro variables al `.env` de producción. Las demás no cambian.

| Variable | Obligatoria | Cómo generarla |
|---|---|---|
| `TOKEN_ENCRYPTION_KEY` | **Sí. Sin ella el servicio no arranca** | `openssl rand -base64 32` |
| `ADMIN_USERNAME` | Para usar `/admin` | El nombre que quieras, por ejemplo `admin` |
| `ADMIN_PASSWORD_HASH` | Para usar `/admin` | `npm run admin:hash` (ver abajo) |
| `ADMIN_SESSION_SECRET` | Para usar `/admin` | `openssl rand -base64 48` |

Si faltan las tres `ADMIN_*`, el servicio funciona igual, pero `/admin` responde "Administración web no configurada".

### Generar los valores en el servidor

```bash
cd /opt/mail-service-api

openssl rand -base64 32      # → TOKEN_ENCRYPTION_KEY
openssl rand -base64 48      # → ADMIN_SESSION_SECRET
npm run admin:hash           # pide la contraseña dos veces (mín. 12 caracteres) → ADMIN_PASSWORD_HASH
```

`npm run admin:hash` necesita las dependencias instaladas (paso 5.2). Si aún no las tienes, genera el hash después de ese paso, pero **antes** de reiniciar el servicio.

El `.env` queda con estas líneas adicionales:

```dotenv
TOKEN_ENCRYPTION_KEY=Qm9...=
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$Xy...
ADMIN_SESSION_SECRET=Zk1...
```

> ⚠️ **Respalda `TOKEN_ENCRYPTION_KEY`** en el mismo lugar donde guardan los secretos de Azure. Si se pierde, los tokens cifrados quedan ilegibles y **todos** los buzones tendrán que autorizarse de nuevo. No la cambies después del despliegue por la misma razón.

### El carácter `$` del hash

`ADMIN_PASSWORD_HASH` contiene varios `$`. Depende de dónde lea el servicio las variables:

| Dónde están las variables | ¿Qué hacer con los `$`? |
|---|---|
| `.env` en el `WorkingDirectory`, leído por la aplicación | Nada: se pega tal cual |
| `EnvironmentFile=` en la unidad de systemd | Nada: systemd no expande `$` en esos archivos. No lo pongas entre comillas dobles con barras invertidas |
| `Environment=` directamente en la unidad | Nada con `$`, pero un `%` se escribe `%%` (el hash bcrypt no contiene `%`) |
| Exportado en un script de shell (`export ...`) | Comillas simples: `export ADMIN_PASSWORD_HASH='$2b$12$...'` |

Para saber cuál es tu caso: `systemctl cat mail-service`.

### Permisos del archivo

```bash
sudo chown mailsvc: /opt/mail-service-api/.env
sudo chmod 600 /opt/mail-service-api/.env
```

---

## 5. Despliegue

### 5.1 Obtener el código

```bash
cd /opt/mail-service-api
sudo -u mailsvc git fetch origin
sudo -u mailsvc git checkout main && sudo -u mailsvc git pull
```

### 5.2 Dependencias

```bash
sudo -u mailsvc npm ci
sudo -u mailsvc npm --prefix admin-ui ci      # nuevo: dependencias de la interfaz
sudo -u mailsvc npx prisma generate
```

### 5.3 Migración de base de datos

Crea la tabla `ConsentRequest`. No modifica ni borra datos existentes.

```bash
sudo -u mailsvc npx prisma migrate deploy
```

Debe aplicar `20261024151653_add_consent_requests`.

### 5.4 Variables de entorno

Agrega las variables de la sección 4 **antes** de reiniciar. Sin `TOKEN_ENCRYPTION_KEY`, el servicio no arranca.

### 5.5 Compilar

```bash
sudo -u mailsvc npm run build
```

Compila el API en `dist/src` y la interfaz en `dist/admin-ui`. Comprueba que existe `dist/admin-ui/index.html`.

### 5.6 Reiniciar el servicio

```bash
sudo systemctl restart mail-service
sudo systemctl status mail-service --no-pager
sudo journalctl -u mail-service -n 50 --no-pager
```

En el log debe aparecer `Application running on port ...` y **no** debe aparecer:

| Mensaje en el log | Significa |
|---|---|
| `TOKEN_ENCRYPTION_KEY no está configurada` / `debe contener 32 bytes` | Falta o es inválida la clave; el servicio no arrancó |
| `Administración web deshabilitada. Revise: ...` | Alguna variable `ADMIN_*` falta o es inválida; el mensaje dice cuál |
| `Interfaz de administración no encontrada en ...` | No existe `dist/admin-ui`; repite el paso 5.5 |

### 5.7 Cifrar los tokens existentes

Hasta ahora, los tokens de los buzones ya autorizados estaban guardados en texto plano. El servicio los sigue leyendo, así que **no hay interrupción**, pero deben cifrarse:

```bash
cd /opt/mail-service-api
sudo -u mailsvc npm run tokens:encrypt
```

El script:
- Lee `DATABASE_URL` y `TOKEN_ENCRYPTION_KEY` del `.env` del directorio actual. Si en tu servidor las variables solo viven en un `EnvironmentFile` de systemd, ejecútalo con ese entorno:
  ```bash
  sudo systemd-run --uid=mailsvc --pipe --wait \
    --property=EnvironmentFile=/ruta/al/archivo.env \
    --working-directory=/opt/mail-service-api \
    /usr/bin/npm run tokens:encrypt
  ```
- Es idempotente: se puede ejecutar varias veces sin efecto adicional.
- Imprime la **lista de buzones ya autorizados**. Se autorizaron antes de que existiera la verificación de cuenta, así que revisa que cada uno corresponda a su propietario real. Si dudas de alguno, genera un enlace nuevo desde `/admin` y pide al propietario que lo autorice otra vez.

Al terminar, en el log del servicio ya no debe aparecer `Se leyó un token sin cifrar`.

---

## 6. Proxy inverso (si aplica)

Si el servicio se publica detrás de nginx u otro proxy:

1. **Rutas nuevas que el proxy debe reenviar**, si reenvía solo rutas específicas: `/admin` (y todo lo que hay debajo) y `/admin-session/`. `/auth/consent` y `/auth/callback` ya existían.
2. **HTTPS**: publica `/admin` solo por HTTPS. La cookie de sesión se marca `Secure` cuando el servicio detecta HTTPS, para lo cual el proxy debe enviar `X-Forwarded-Proto`:
   ```nginx
   location / {
       proxy_pass         http://127.0.0.1:3002;
       proxy_set_header   Host              $host;
       proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
       proxy_set_header   X-Forwarded-Proto $scheme;
   }
   ```
3. **Proxy en otra máquina**: el servicio solo confía en las cabeceras `X-Forwarded-*` cuando el proxy está en la misma máquina o en una red privada (10.x, 172.16–31.x, 192.168.x). Si el proxy está en otra IP pública, la cookie no llevará `Secure` y el límite de intentos de login contará todas las peticiones como una sola IP. En ese caso hay que ajustar `trust proxy` en `src/main.ts`.

---

## 7. Verificación después del despliegue

```bash
URL=https://correo.dgeti.gob.mx

# 1. La interfaz responde
curl -s -o /dev/null -w '%{http_code}\n' $URL/admin/                    # 200

# 2. El API sigue protegido
curl -s -o /dev/null -w '%{http_code}\n' $URL/systems                   # 401

# 3. Los enlaces antiguos ya no funcionan
curl -s -o /dev/null -w '%{http_code}\n' "$URL/auth/consent?mailboxId=x" # 400

# 4. Las respuestas de buzones ya no traen tokens (requiere ADMIN_API_KEY)
curl -s $URL/systems/<systemId>/mailboxes -H "x-admin-api-key: $ADMIN_API_KEY" | grep -c accessToken   # 0
```

En el navegador:

- [ ] `$URL/admin` muestra el login, y el usuario y contraseña configurados funcionan.
- [ ] La lista de sistemas muestra los sistemas existentes.
- [ ] En un sistema, los buzones ya autorizados aparecen como **Autorizado**.
- [ ] Un sistema consumidor envía un correo de prueba y llega (`GET /audit/email-logs` muestra `SENT`).
- [ ] Opcional: generar un enlace para un buzón de prueba, autorizarlo y enviar desde él.

---

## 8. Avisos

Envía este aviso a quienes administran buzones:

> A partir de esta actualización, los buzones se autorizan con un enlace que genera el administrador desde `https://correo.dgeti.gob.mx/admin` (o con `POST /mailboxes/:id/consent-link`). El enlace caduca en 24 horas, sirve una sola vez y debe abrirlo el propietario del buzón, iniciando sesión con esa misma cuenta. Los enlaces anteriores (`/auth/consent?mailboxId=...`) ya no funcionan.

Los sistemas consumidores no necesitan hacer nada.

---

## 9. Rollback

Si hay que volver a la versión anterior:

1. **Descifrar los tokens con la versión nueva todavía instalada**, porque la anterior no entiende tokens cifrados:
   ```bash
   cd /opt/mail-service-api
   sudo -u mailsvc npm run tokens:encrypt -- --decrypt
   ```
2. Volver al commit anotado en la sección 2 y recompilar:
   ```bash
   sudo -u mailsvc git checkout <commit-anterior>
   sudo -u mailsvc npm ci
   sudo -u mailsvc npx prisma generate
   sudo -u mailsvc npm run build
   sudo systemctl restart mail-service
   ```
3. La tabla `ConsentRequest` y las variables nuevas del `.env` pueden quedarse; la versión anterior las ignora.

Los buzones autorizados **después** del despliegue conservan sus tokens (descifrados en el paso 1) y siguen funcionando con la versión anterior.

---

## Referencia: unidad de systemd

No es necesario cambiar la unidad existente. Como referencia, esto es lo que el servicio necesita:

```ini
# /etc/systemd/system/mail-service.service
[Unit]
Description=Mail Service API (DGETI)
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=mailsvc
# La aplicación lee .env y resuelve UPLOAD_DIR relativo a este directorio
WorkingDirectory=/opt/mail-service-api
ExecStart=/usr/bin/node dist/src/main
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

- `WorkingDirectory` debe ser la raíz del repositorio: ahí se buscan `.env`, `uploads/` y `dist/`.
- `ExecStart` debe apuntar a `dist/src/main`; la interfaz se sirve desde `dist/admin-ui`, junto a él.
- Después de modificar la unidad: `sudo systemctl daemon-reload && sudo systemctl restart mail-service`.
