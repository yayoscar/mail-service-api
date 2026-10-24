import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './config/prisma.module';
import { AdminGuard } from './common/guards/admin.guard';
import { SystemsModule } from './modules/systems/systems.module';
import { MailboxesModule } from './modules/mailboxes/mailboxes.module';
import { EmailsModule } from './modules/emails/emails.module';
import { GraphModule } from './modules/graph/graph.module';
import { QueueModule } from './modules/queue/queue.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminSessionModule } from './modules/admin-session/admin-session.module';

// Built by `npm run build` into dist/admin-ui, next to the compiled dist/src
const ADMIN_UI_PATH = join(__dirname, '..', 'admin-ui');

function adminUiModules() {
  if (!existsSync(join(ADMIN_UI_PATH, 'index.html'))) {
    new Logger('AdminUi').warn(
      `Interfaz de administración no encontrada en ${ADMIN_UI_PATH}; /admin no estará disponible. ` +
        'Compílela con npm run build.',
    );
    return [];
  }
  return [ServeStaticModule.forRoot({ rootPath: ADMIN_UI_PATH, serveRoot: '/admin' })];
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AdminSessionModule,
    AuthModule,
    SystemsModule,
    MailboxesModule,
    EmailsModule,
    GraphModule,
    QueueModule,
    AuditModule,
    ...adminUiModules(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AdminGuard,
    },
  ],
})
export class AppModule {}
