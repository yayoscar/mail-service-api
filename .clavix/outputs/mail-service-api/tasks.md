# Implementation Plan

**Project**: mail-service-api
**Generated**: 2026-05-23T00:00:00Z

## Technical Context & Standards

- **Architecture**: NestJS modular monolith — module-based with service layer
- **Framework**: NestJS (latest stable) with TypeScript strict mode
- **Database**: PostgreSQL 16 via Prisma ORM
- **Queue**: BullMQ + Redis 7
- **Email Provider**: Microsoft Graph API v1.0 (OAuth2 Authorization Code Flow, Delegated Permission Mail.Send + offline_access)
- **File Upload**: Multer (multipart/form-data)
- **Validation**: class-validator + class-transformer
- **Documentation**: Swagger/OpenAPI via @nestjs/swagger
- **Containers**: Podman Compose (NOT Docker) — `postgres:16`, `redis:7`
- **Conventions**: kebab-case filenames, DTOs per module, Prisma for all DB access, no hardcoded values

---

## Phase 1: Project Scaffolding & Infrastructure

- [x] **Initialize NestJS project** (ref: Technical Requirements > Stack)
  Task ID: phase-1-scaffolding-01
  > **Implementation**: Run `npx @nestjs/cli new mail-service-api` in `/home/oscar/Repos/correos/`, select TypeScript, npm. Then install core dependencies: `npm i @nestjs/config @nestjs/swagger @nestjs/bullmq bullmq @nestjs/platform-express multer class-validator class-transformer prisma @prisma/client bcrypt uuid`.
  > **Details**: Install dev dependencies: `npm i -D @types/multer @types/bcrypt @types/uuid`. Ensure `tsconfig.json` has `strict: true`.

- [x] **Create Podman Compose file** (ref: Contenedores)
  Task ID: phase-1-scaffolding-02
  > **Implementation**: Create `compose.yml` at project root.
  > **Details**: Define two services: `postgres` (image `postgres:16`, container_name `mail_service_postgres`, env vars `POSTGRES_USER=mail_user`, `POSTGRES_PASSWORD=mail_password`, `POSTGRES_DB=mail_service`, ports `5432:5432`, volume `postgres_data:/var/lib/postgresql/data`) and `redis` (image `redis:7`, container_name `mail_service_redis`, ports `6379:6379`). Define volume `postgres_data` at bottom.

- [x] **Create .env and .env.example files** (ref: Variables de Entorno)
  Task ID: phase-1-scaffolding-03
  > **Implementation**: Create `.env.example` with all required variables: `DATABASE_URL=postgresql://mail_user:mail_password@localhost:5432/mail_service`, `REDIS_HOST=localhost`, `REDIS_PORT=6379`, `AZURE_TENANT_ID=`, `AZURE_CLIENT_ID=`, `AZURE_CLIENT_SECRET=`, `GRAPH_SCOPE=https://graph.microsoft.com/.default`, `ADMIN_API_KEY=`, `PORT=3002`, `UPLOAD_DIR=./uploads`, `MAX_ATTACHMENT_SIZE=26214400`. Copy to `.env` with dev values. Add `.env` to `.gitignore`.

- [x] **Create folder structure** (ref: Estructura de Proyecto)
  Task ID: phase-1-scaffolding-04
  > **Implementation**: Create directories under `src/`: `config/`, `common/guards/`, `common/decorators/`, `common/filters/`, `common/interceptors/`, `modules/auth/`, `modules/systems/dto/`, `modules/mailboxes/dto/`, `modules/emails/dto/`, `modules/graph/`, `modules/queue/`, `modules/audit/`. Create `uploads/` directory at project root and add it to `.gitignore`.

- [x] **Configure Prisma** (ref: Entidades Prisma)
  Task ID: phase-1-scaffolding-05
  > **Implementation**: Run `npx prisma init`. Edit `prisma/schema.prisma`: set provider to `postgresql`, datasource url to `env("DATABASE_URL")`. Define `enum EmailStatus { PENDING QUEUED SENT FAILED RETRYING }`. Define model `System` (id String @id @default(uuid()), key String @unique, name String, apiKeyHash String, active Boolean @default(true), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt). Define model `Mailbox` (id String @id @default(uuid()), systemId String, system System @relation(fields: [systemId], references: [id], onDelete: Cascade), email String @unique, displayName String, isDefault Boolean @default(false), active Boolean @default(true), createdAt DateTime @default(now()), updatedAt DateTime @updatedAt, @@index([systemId])). Define model `EmailLog` (id String @id @default(uuid()), systemId String, system System @relation(fields: [systemId], references: [id]), mailboxId String, mailbox Mailbox @relation(fields: [mailboxId], references: [id]), from String, to Json, cc Json?, bcc Json?, subject String, htmlBody String, attachments Json?, status EmailStatus @default(QUEUED), provider String @default("MICROSOFT_GRAPH"), providerResponse String?, errorMessage String?, attempts Int @default(0), sentAt DateTime?, createdAt DateTime @default(now()), updatedAt DateTime @updatedAt, @@index([systemId]), @@index([mailboxId]), @@index([status])).

- [x] **Generate Prisma client and initial migration** (ref: Entidades Prisma)
  Task ID: phase-1-scaffolding-06
  > **Implementation**: Ensure Podman containers are running (`podman compose up -d`). Run `npx prisma migrate dev --name init`. Run `npx prisma generate`. Create `src/config/prisma.service.ts` — a `PrismaService` class extending `PrismaClient` that implements `OnModuleInit` and `OnModuleDestroy` for connection lifecycle management. Export it as a `@Global()` provider from `src/config/prisma.module.ts`.

---

## Phase 2: Common Infrastructure (Guards, Filters, Interceptors)

- [x] **Create configuration module** (ref: Variables de Entorno)
  Task ID: phase-2-common-01
  > **Implementation**: Create `src/config/env.validation.ts` — export a function that builds a `ConfigModule` with `@nestjs/config` using `registerAs` or `forRoot` with a validation schema ( Joi or manual `zod`/custom class). At minimum validate that `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `ADMIN_API_KEY` are present. Create `src/config/config.module.ts` that wraps `ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })`.

- [x] **Create global exception filter** (ref: Architecture > Manejo global de errores)
  Task ID: phase-2-common-02
  > **Implementation**: Create `src/common/filters/all-exceptions.filter.ts`. Implement `ExceptionFilter` that catches all exceptions. For `HttpException`, extract status and message. For unknown errors, return 500 with generic message. Log the error (without secrets). Response format: `{ statusCode, message, timestamp, path }`.

- [x] **Create response transform interceptor** (ref: Architecture > Respuestas consistentes)
  Task ID: phase-2-common-03
  > **Implementation**: Create `src/common/interceptors/transform.interceptor.ts`. Implement `NestInterceptor` that wraps successful responses in `{ success: true, data: <response> }`. Apply globally in `main.ts`.

- [x] **Create custom decorators** (ref: Security > Guards)
  Task ID: phase-2-common-04
  > **Implementation**: Create `src/common/decorators/api-key.decorator.ts` — a `@RequireApiKey()` decorator using `SetMetadata('requireApiKey', true)`. Create `src/common/decorators/admin.decorator.ts` — a `@RequireAdmin()` decorator using `SetMetadata('requireAdmin', true)`.

- [x] **Create ApiKeyGuard** (ref: Security)
  Task ID: phase-2-common-05
  > **Implementation**: Create `src/common/guards/api-key.guard.ts`. Implement `CanActivate` that reads `x-api-key` from request headers. Inject `PrismaService`. Hash the provided key with bcrypt and compare against all `apiKeyHash` values in System table (use `bcrypt.compare`). If match found, attach the system to `request.system` and return true. If no match, throw 401. Cache system lookups for performance (optional optimization).

- [x] **Create AdminGuard** (ref: Security)
  Task ID: phase-2-common-06
  > **Implementation**: Create `src/common/guards/admin.guard.ts`. Implement `CanActivate` that reads `x-admin-api-key` from request headers. Compare directly (constant-time comparison or `crypto.timingSafeEqual`) against `ADMIN_API_KEY` from `ConfigService`. If match, return true. If not, throw 401.

- [x] **Configure main.ts bootstrap** (ref: Technical Requirements)
  Task ID: phase-2-common-07
  > **Implementation**: Edit `src/main.ts`. Set port from `ConfigService` (default 3002). Enable `ValidationPipe` globally with `whitelist: true, forbidNonWhitelisted: true, transform: true`. Use `useGlobalFilters` for the exception filter. Use `useGlobalInterceptors` for the transform interceptor. Enable CORS. Set up Swagger with `DocumentBuilder`: title "Mail Service API", description, version "1.0", add security bearer for `x-api-key` and `x-admin-api-key`, set `SwaggerModule.setup('docs', app, document)`.

- [x] **Wire app.module.ts** (ref: Estructura de Proyecto)
  Task ID: phase-2-common-08
  > **Implementation**: Edit `src/app.module.ts`. Import `ConfigModule`, `PrismaModule`, and placeholder modules for each domain: `SystemsModule`, `MailboxesModule`, `EmailsModule`, `GraphModule`, `QueueModule`, `AuditModule`. Register guards globally: `APP_GUARD` for `AdminGuard` (check metadata `requireAdmin` first — if not set, pass through). ApiKeyGuard will be applied per-controller/route.

---

## Phase 3: Systems Module

- [x] **Create System DTOs** (ref: Gestión de Sistemas CRUD)
  Task ID: phase-3-systems-01
  > **Implementation**: Create `src/modules/systems/dto/create-system.dto.ts` with `class-validator`: `key` (string, required, pattern `^[a-z0-9-]+$`), `name` (string, required, min length 2). Create `src/modules/systems/dto/update-system.dto.ts` extending `PartialType` of create. Create `src/modules/systems/dto/regenerate-api-key-response.dto.ts` for the response shape.

- [x] **Create SystemsService** (ref: Gestión de Sistemas CRUD)
  Task ID: phase-3-systems-02
  > **Implementation**: Create `src/modules/systems/systems.service.ts`. Inject `PrismaService`. Methods: `create(dto)` — generate random API Key using `crypto.randomUUID()` or `crypto.randomBytes(32).toString('hex')`, hash it with `bcrypt.hash(key, 10)`, store hash as `apiKeyHash`, return the plain key ONE TIME only (response includes `key` and hashed entity without returning hash). `findAll()` — return all systems (exclude `apiKeyHash` from response). `findOne(id)` — find by id or throw 404. `update(id, dto)` — update name/active, exclude `apiKeyHash` from response. `regenerateApiKey(id)` — generate new key, hash it, update `apiKeyHash`, return plain key. `findByApiKeyHash(apiKey)` — used by ApiKeyGuard, hash the provided key and find matching system.

- [x] **Create SystemsController** (ref: API Endpoints > Sistemas)
  Task ID: phase-3-systems-03
  > **Implementation**: Create `src/modules/systems/systems.controller.ts`. Decorate with `@Controller('systems')`, `@ApiTags('Systems')`. Apply `@UseGuards(AdminGuard)` at class level with `@RequireAdmin()`. Endpoints: `POST /` — `create()`, returns 201 with system + plain API Key (shown once). `GET /` — `findAll()`, returns array. `PATCH /:id` — `update()`. `POST /:id/regenerate-api-key` — `regenerateApiKey()`. Add Swagger decorators (`@ApiOperation`, `@ApiResponse`, `@ApiParam`) to each endpoint.

- [x] **Create SystemsModule** (ref: Estructura de Proyecto)
  Task ID: phase-3-systems-04
  > **Implementation**: Create `src/modules/systems/systems.module.ts`. Register `SystemsController` and `SystemsService`. Export `SystemsService` (needed by MailboxesModule and EmailsModule).

---

## Phase 4: Mailboxes Module

- [x] **Create Mailbox DTOs** (ref: Gestión de Buzones Autorizados)
  Task ID: phase-4-mailboxes-01
  > **Implementation**: Create `src/modules/mailboxes/dto/create-mailbox.dto.ts`: `email` (string, required, `isEmail`), `displayName` (string, required), `isDefault` (boolean, optional, default false). Create `src/modules/mailboxes/dto/update-mailbox.dto.ts`: `email` (optional, `isEmail`), `displayName` (optional), `active` (optional). Create `src/modules/mailboxes/dto/set-default.dto.ts` (empty body, no fields needed).

- [x] **Create MailboxesService** (ref: Gestión de Buzones Autorizados)
  Task ID: phase-4-mailboxes-02
  > **Implementation**: Create `src/modules/mailboxes/mailboxes.service.ts`. Inject `PrismaService`. Methods: `create(systemId, dto)` — verify system exists, check email uniqueness, if `isDefault: true` then unset any existing default for this system (transaction), create mailbox. `findBySystem(systemId)` — return all mailboxes for a system (active only). `findOne(id)` — find or throw 404. `update(id, dto)` — update fields, if email is being changed validate it's unique. `deactivate(id)` — set `active: false`, cannot deactivate the default mailbox (throw 400 if default). `setDefault(id)` — in a transaction, unset current default for same system, set this one as default. `findDefaultBySystemId(systemId)` — find where `{ systemId, isDefault: true, active: true }`. `findBySystemAndEmail(systemId, email)` — find where `{ systemId, email, active: true }`.

- [x] **Create MailboxesController** (ref: API Endpoints > Mailboxes)
  Task ID: phase-4-mailboxes-03
  > **Implementation**: Create `src/modules/mailboxes/mailboxes.controller.ts`. Decorate with `@Controller()`, `@ApiTags('Mailboxes')`. Apply `@UseGuards(AdminGuard)` with `@RequireAdmin()`. Endpoints: `POST /systems/:systemId/mailboxes` — `create()`, validate systemId exists. `GET /systems/:systemId/mailboxes` — `findBySystem()`. `PATCH /mailboxes/:id` — `update()`. `DELETE /mailboxes/:id` — `deactivate()`. `PATCH /mailboxes/:id/default` — `setDefault()`. Add Swagger decorators to all endpoints.

- [x] **Create MailboxesModule** (ref: Estructura de Proyecto)
  Task ID: phase-4-mailboxes-04
  > **Implementation**: Create `src/modules/mailboxes/mailboxes.module.ts`. Import `SystemsModule` (to validate system exists). Register `MailboxesController` and `MailboxesService`. Export `MailboxesService`.

---

## Phase 5: Microsoft Graph Integration Module

- [x] **Create GraphMailService** (ref: Autenticación Microsoft Graph, Worker)
  Task ID: phase-5-graph-01
  > **Implementation**: Create `src/modules/graph/graph-mail.service.ts`. Inject `ConfigService`. Private properties: `accessToken` (string|null), `tokenExpiresAt` (number, timestamp). Methods: `getAccessToken()` — if cached token exists and `Date.now() < tokenExpiresAt - 60000` (60s margin), return cached. Otherwise, POST to `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with body `client_id`, `client_secret`, `scope`, `grant_type=client_credentials` using native `fetch`. Parse response, store `access_token` and calculate `tokenExpiresAt = Date.now() + expires_in * 1000`. Return token. `sendMail(params: { from, subject, htmlBody, to, cc, bcc, attachments })` — call `getAccessToken()`, build Graph API body with `message` object containing `subject`, `body: { contentType: 'HTML', content }`, `toRecipients`, `ccRecipients`, `bccRecipients`, `attachments` array (each with `@odata.type: '#microsoft.graph.fileAttachment'`, `name`, `contentType`, `contentBytes` as base64). POST to `https://graph.microsoft.com/v1.0/users/${from}/sendMail`. Handle errors: parse Graph error response, throw appropriate exceptions with status codes. Never log the access token.

- [x] **Create GraphModule** (ref: Estructura de Proyecto)
  Task ID: phase-5-graph-02
  > **Implementation**: Create `src/modules/graph/graph.module.ts`. Register `GraphMailService` as a provider. Export `GraphMailService`.

---

## Phase 6: Queue Module & Worker

- [x] **Create QueueModule with BullMQ** (ref: Worker de Procesamiento, Stack)
  Task ID: phase-6-queue-01
  > **Implementation**: Create `src/modules/queue/queue.module.ts`. Register BullMQ using `@nestjs/bullmq`: `BullModule.forRoot({ connection: { host: configService.get('REDIS_HOST'), port: configService.get('REDIS_PORT') } })` and `BullModule.registerQueue({ name: 'email-send', defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: false, removeOnFail: false } })`.

- [x] **Create EmailProcessor** (ref: Worker de Procesamiento)
  Task ID: phase-6-queue-02
  > **Implementation**: Create `src/modules/queue/email.processor.ts`. Use `@Processor('email-send')`. Inject `PrismaService`, `GraphMailService`. Method `@Process('email-send') async processEmail(job: Job<{ emailLogId: string }>)` — read EmailLog by ID, increment `attempts`, update status to RETRYING. Read attachment files from disk paths stored in job data. Convert each file to base64. Call `graphMailService.sendMail()` with all params including attachments. On success: update EmailLog to SENT, set `sentAt` to new Date(), store `providerResponse`, delete temporary attachment files from `UPLOAD_DIR`. On error with status 429: extract `Retry-After` header, throw error with custom delay to respect throttling. On error with 5xx: throw error to trigger BullMQ retry. On definitive failure (all attempts exhausted): update EmailLog to FAILED, store `errorMessage`, delete temporary attachment files.

- [x] **Create attachment cleanup utility** (ref: Almacenamiento de Adjuntos)
  Task ID: phase-6-queue-03
  > **Implementation**: Create `src/modules/queue/attachment.utils.ts`. Export function `cleanupFiles(filePaths: string[])` — iterate over paths, unlink each file with `fs.promises.unlink`, catch and log ENOENT errors silently. Export function `filesToBase64(filePaths: string[])` — read each file with `fs.promises.readFile`, convert to base64 string, return array of `{ name, contentType, contentBytes }`.

---

## Phase 7: Emails Module (Send Endpoint)

- [x] **Create Email DTOs** (ref: Payload de Envío)
  Task ID: phase-7-emails-01
  > **Implementation**: Create `src/modules/emails/dto/send-email.dto.ts`. Since the endpoint uses `multipart/form-data`, create a DTO for the JSON fields: `from` (string, optional, `isEmail`), `to` (string, required — will be parsed from JSON string to array), `cc` (string, optional), `bcc` (string, optional), `subject` (string, required, minLength 1), `html` (string, required, minLength 1). Add `@Transform` decorators to parse `to`, `cc`, `bcc` from JSON string to string array. Validate each email in arrays with `isEmail`. Create `src/modules/emails/dto/send-email-response.dto.ts`: `message: string`, `emailLogId: string`, `status: string`.

- [x] **Create EmailsService** (ref: Envío de Correos con Adjuntos por Cola)
  Task ID: phase-7-emails-02
  > **Implementation**: Create `src/modules/emails/emails.service.ts`. Inject `PrismaService`, `MailboxesService`, `SystemsService`. Inject queue via `@InjectQueue('email-send')`. Method `send(systemId: string, dto: SendEmailDto, files: Express.Multer.File[])` — resolve `from`: if provided, call `mailboxesService.findBySystemAndEmail(systemId, dto.from)`, if not found throw 403; if not provided, call `mailboxesService.findDefaultBySystemId(systemId)`, if none throw 400. Build attachments metadata: `files.map(f => ({ name: f.originalname, contentType: f.mimetype, size: f.size, path: f.path }))`. Create EmailLog via Prisma with all fields, status QUEUED. Add job to queue: `this.emailQueue.add('email-send', { emailLogId: log.id, attachmentPaths: files.map(f => f.path) })`. Return `{ message: 'Correo encolado correctamente', emailLogId: log.id, status: 'QUEUED' }`.

- [x] **Create EmailsController** (ref: API Endpoints > Emails)
  Task ID: phase-7-emails-03
  > **Implementation**: Create `src/modules/emails/emails.controller.ts`. Decorate with `@Controller('emails')`, `@ApiTags('Emails')`, `@UseGuards(ApiKeyGuard)`, `@RequireApiKey()`. Endpoint `POST /send` — use `@UseInterceptors(FilesInterceptor('attachments', 10, multerOptions))` where `multerOptions` configures `dest` from `ConfigService.get('UPLOAD_DIR')`, `limits.fileSize` from `MAX_ATTACHMENT_SIZE`. Accept `@Body() dto: SendEmailDto` and `@UploadedFiles() files: Express.Multer.File[]`. Call `emailsService.send(req.system.id, dto, files)`. Add full Swagger documentation with `@ApiConsumes('multipart/form-data')`, `@ApiBody` with schema showing all fields, `@ApiResponse` examples.

- [x] **Create Multer configuration** (ref: Almacenamiento de Adjuntos)
  Task ID: phase-7-emails-04
  > **Implementation**: Create `src/config/multer.config.ts`. Export `MulterModule.registerAsync` factory that reads `UPLOAD_DIR` and `MAX_ATTACHMENT_SIZE` from `ConfigService`. Create the `uploads/` directory if it doesn't exist. Configure file naming to include timestamp and random suffix to avoid collisions.

- [x] **Create EmailsModule** (ref: Estructura de Proyecto)
  Task ID: phase-7-emails-05
  > **Implementation**: Create `src/modules/emails/emails.module.ts`. Import `MailboxesModule`, `SystemsModule`, `QueueModule`, `GraphModule`, `ConfigModule`. Register `MulterModule` with the async config. Register `EmailsController` and `EmailsService`.

---

## Phase 8: Audit Module

- [x] **Create Audit DTOs** (ref: Auditoría Completa)
  Task ID: phase-8-audit-01
  > **Implementation**: Create `src/modules/audit/dto/query-email-log.dto.ts`: `status` (optional, `IsEnum(EmailStatus)`), `systemId` (optional), `page` (optional, `@Type(() => Number)`, `@IsInt`, default 1), `limit` (optional, `@Type(() => Number)`, `@IsInt`, max 100, default 20).

- [x] **Create AuditService** (ref: Auditoría Completa)
  Task ID: phase-8-audit-02
  > **Implementation**: Create `src/modules/audit/audit.service.ts`. Inject `PrismaService`. Methods: `findAll(query)` — paginated query on EmailLog with optional filters (status, systemId), include relations to System and Mailbox, order by `createdAt DESC`, return `{ data, total, page, limit }`. `findOne(id)` — return single EmailLog with relations.

- [x] **Create AuditController** (ref: Auditoría Completa)
  Task ID: phase-8-audit-03
  > **Implementation**: Create `src/modules/audit/audit.controller.ts`. Decorate with `@Controller('audit')`, `@ApiTags('Audit')`, `@UseGuards(AdminGuard)`, `@RequireAdmin()`. Endpoints: `GET /email-logs` — paginated list with query params. `GET /email-logs/:id` — single log detail.

- [x] **Create AuditModule** (ref: Estructura de Proyecto)
  Task ID: phase-8-audit-04
  > **Implementation**: Create `src/modules/audit/audit.module.ts`. Register `AuditController` and `AuditService`.

---

## Phase 9: Swagger Documentation

- [x] **Complete Swagger setup and document all endpoints** (ref: Documentación)
  Task ID: phase-9-docs-01
  > **Implementation**: In `src/main.ts`, configure `DocumentBuilder` with title "Mail Service API", description "Servicio centralizado de envío de correos institucionales via Microsoft Graph", version "1.0". Add two security schemes: `x-api-key` (header, type apiKey, name `x-api-key`) and `x-admin-api-key` (header, type apiKey, name `x-admin-api-key`). Apply `@ApiSecurity('x-api-key')` to EmailsController and `@ApiSecurity('x-admin-api-key')` to SystemsController, MailboxesController, AuditController. Add `@ApiBearerAuth` if needed. Ensure every endpoint has `@ApiOperation({ summary })`, `@ApiResponse({ status, description })`, and request body examples where applicable.

---

## Phase 10: README & Final Polish

- [x] **Create README.md** (ref: Entorno de Desarrollo)
  Task ID: phase-10-readme-01
  > **Implementation**: Create `README.md` at project root in Spanish. Sections: (1) Descripción del proyecto. (2) Stack tecnológico. (3) Prerrequisitos (Node.js 20+, Podman). (4) Instalación: `git clone`, `cd mail-service-api`, `npm install`. (5) Configuración: copiar `.env.example` a `.env`, describir cada variable. (6) Levantar servicios: `podman compose up -d`, verificar con `podman ps`. (7) Migraciones: `npx prisma migrate dev`. (8) Ejecutar API: `npm run start:dev`. (9) Swagger: `http://localhost:3002/docs`. (10) Ejemplo de uso completo: crear sistema, agregar buzón, enviar correo con curl (multipart/form-data con adjuntos). (11) Integración con Microsoft Graph: pasos para App Registration, Mail.Send, admin consent. (12) Notas de seguridad: hash de API Keys, governance sobre Mail.Send. (13) Advertencia de no guardar secrets en repo.

- [x] **Create .gitignore and project config files** (ref: Security Requirements)
  Task ID: phase-10-readme-02
  > **Implementation**: Ensure `.gitignore` includes: `node_modules/`, `.env`, `dist/`, `uploads/`, `*.pem`, `*.key`. Verify `nest-cli.json` is correct. Add `prisma/seed.ts` placeholder if needed.

---

## Dependency Graph

```
Phase 1 (Scaffolding)
  └── Phase 2 (Common Infrastructure)
       ├── Phase 3 (Systems Module)
       │    └── Phase 4 (Mailboxes Module) [depends on Systems]
       │         └── Phase 7 (Emails Module) [depends on Mailboxes + Systems + Queue + Graph]
       ├── Phase 5 (Graph Module) [standalone]
       ├── Phase 6 (Queue Module) [depends on Graph]
       └── Phase 8 (Audit Module) [depends on Prisma only]
              Phase 9 (Swagger) [depends on all modules]
              Phase 10 (README) [last]
```

---

*Generated by Clavix /clavix:plan*
