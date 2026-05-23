import { Injectable, HttpException, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

export interface SendMailParams {
  from: string;
  mailboxId: string;
  subject: string;
  htmlBody: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
  }>;
}

@Injectable()
export class GraphMailService {
  private readonly logger = new Logger(GraphMailService.name);

  constructor(private authService: AuthService) {}

  async sendMail(params: SendMailParams): Promise<string> {
    const token = await this.authService.getValidAccessToken(params.mailboxId);

    const graphBody: Record<string, unknown> = {
      message: {
        subject: params.subject,
        body: {
          contentType: 'HTML',
          content: params.htmlBody,
        },
        toRecipients: params.to.map((addr) => ({
          emailAddress: { address: addr },
        })),
        ...(params.cc?.length && {
          ccRecipients: params.cc.map((addr) => ({
            emailAddress: { address: addr },
          })),
        }),
        ...(params.bcc?.length && {
          bccRecipients: params.bcc.map((addr) => ({
            emailAddress: { address: addr },
          })),
        }),
        ...(params.attachments?.length && {
          attachments: params.attachments.map((att) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.name,
            contentType: att.contentType,
            contentBytes: att.contentBytes,
          })),
        }),
      },
      saveToSentItems: true,
    };

    const graphUrl = 'https://graph.microsoft.com/v1.0/me/sendMail';

    this.logger.debug(`Token prefix: ${token.substring(0, 20)}...`);

    const response = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphBody),
    });

    if (response.status === 202) {
      return 'SENT';
    }

    if (!response.ok) {
      const errorData = await response.text();
      this.logger.error(`Graph API error (${response.status}): ${errorData}`);

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      throw new HttpException(
        {
          status: response.status,
          message: `Microsoft Graph error: ${errorData}`,
          headers,
        },
        response.status >= 400 && response.status < 500 ? response.status : 502,
      );
    }

    return 'SENT';
  }
}
