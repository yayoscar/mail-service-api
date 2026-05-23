import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { SendEmailDto } from './dto/send-email.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class EmailsService {
  constructor(
    private prisma: PrismaService,
    private mailboxesService: MailboxesService,
    @InjectQueue('email-send') private emailQueue: Queue,
  ) {}

  async send(systemId: string, dto: SendEmailDto, files: Express.Multer.File[]) {
    let mailbox;

    if (dto.from) {
      mailbox = await this.mailboxesService.findBySystemAndEmail(systemId, dto.from);
      if (!mailbox) {
        throw new ForbiddenException(
          `El buzón '${dto.from}' no está autorizado para este sistema`,
        );
      }
    } else {
      mailbox = await this.mailboxesService.findDefaultBySystemId(systemId);
      if (!mailbox) {
        throw new BadRequestException('No hay un buzón default configurado para este sistema');
      }
    }

    const attachmentsMeta = files.map((f) => ({
      name: f.originalname,
      contentType: f.mimetype,
      size: f.size,
      path: f.path,
    }));

    const emailLog = await this.prisma.emailLog.create({
      data: {
        systemId,
        mailboxId: mailbox.id,
        from: mailbox.email,
        to: dto.to as any,
        cc: dto.cc as any,
        bcc: dto.bcc as any,
        subject: dto.subject,
        htmlBody: dto.html,
        attachments: (attachmentsMeta.length > 0 ? attachmentsMeta : undefined) as any,
        status: 'QUEUED',
      },
    });

    await this.emailQueue.add('email-send', {
      emailLogId: emailLog.id,
      attachmentPaths: files.map((f) => f.path),
    });

    return {
      message: 'Correo encolado correctamente',
      emailLogId: emailLog.id,
      status: 'QUEUED',
    };
  }
}
