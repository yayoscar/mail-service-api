import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { GraphMailService } from '../graph/graph-mail.service';
import { cleanupFiles, filesToBase64 } from './attachment.utils';

@Injectable()
@Processor('email-send')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private prisma: PrismaService,
    private graphMailService: GraphMailService,
  ) {
    super();
  }

  async process(job: Job<{ emailLogId: string; attachmentPaths: string[] }>): Promise<void> {
    const { emailLogId, attachmentPaths } = job.data;

    this.logger.log(`Procesando email ${emailLogId}, intento ${job.attemptsMade + 1}`);

    const emailLog = await this.prisma.emailLog.findUnique({
      where: { id: emailLogId },
    });

    if (!emailLog) {
      this.logger.error(`EmailLog ${emailLogId} no encontrado`);
      return;
    }

    await this.prisma.emailLog.update({
      where: { id: emailLogId },
      data: {
        attempts: { increment: 1 },
        status: 'RETRYING',
      },
    });

    try {
      let attachments: Array<{ name: string; contentType: string; contentBytes: string }> = [];

      if (attachmentPaths?.length > 0) {
        attachments = await filesToBase64(attachmentPaths);
      }

      const result = await this.graphMailService.sendMail({
        from: emailLog.from,
        mailboxId: emailLog.mailboxId,
        subject: emailLog.subject,
        htmlBody: emailLog.htmlBody,
        to: emailLog.to as string[],
        cc: (emailLog.cc as string[] | null) ?? undefined,
        bcc: (emailLog.bcc as string[] | null) ?? undefined,
        attachments,
      });

      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          status: 'SENT',
          providerResponse: result,
          sentAt: new Date(),
        },
      });

      if (attachmentPaths?.length > 0) {
        await cleanupFiles(attachmentPaths);
      }

      this.logger.log(`Email ${emailLogId} enviado exitosamente`);
    } catch (error: any) {
      const isRetryable = error.status === 429 || (error.status >= 500 && error.status < 600);
      const attempts = emailLog.attempts + 1;

      if (isRetryable && attempts < 5) {
        this.logger.warn(`Email ${emailLogId} falló (intento ${attempts}), se reintentará: ${error.message}`);
        throw error;
      }

      this.logger.error(`Email ${emailLogId} falló definitivamente: ${error.message}`);

      await this.prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          status: 'FAILED',
          errorMessage: error.message?.substring(0, 1000) || 'Error desconocido',
        },
      });

      if (attachmentPaths?.length > 0) {
        await cleanupFiles(attachmentPaths);
      }
    }
  }
}
