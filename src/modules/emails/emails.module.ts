import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailboxesModule } from '../mailboxes/mailboxes.module';
import { QueueModule } from '../queue/queue.module';
import { GraphModule } from '../graph/graph.module';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { multerConfig } from '../../config/multer.config';

@Module({
  imports: [
    ConfigModule,
    MailboxesModule,
    QueueModule,
    GraphModule,
    multerConfig,
  ],
  controllers: [EmailsController],
  providers: [EmailsService],
})
export class EmailsModule {}
