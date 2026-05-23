import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    SystemsModule,
    MailboxesModule,
    EmailsModule,
    GraphModule,
    QueueModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AdminGuard,
    },
  ],
})
export class AppModule {}
