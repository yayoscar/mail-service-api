import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { SendEmailDto } from './dto/send-email.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { normalizeAttachmentName } from '../queue/attachment.utils';

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
      name: normalizeAttachmentName(f.originalname),
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

    try {
      await this.emailQueue.add('email-send', {
        emailLogId: emailLog.id,
        attachmentPaths: files.map((f) => f.path),
      });
    } catch (error: unknown) {
      // The request is rejected, so the log must not stay QUEUED forever
      const reason = error instanceof Error ? error.message : String(error);
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'FAILED',
          errorMessage: `Error al encolar el correo: ${reason}`.substring(0, 1000),
        },
      });
      throw error;
    }

    return {
      message: 'Correo encolado correctamente',
      emailLogId: emailLog.id,
      status: 'QUEUED',
    };
  }
}
