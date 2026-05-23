import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async getConsentUrl(mailboxId: string): Promise<string> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });

    if (!mailbox) {
      throw new BadRequestException('Buzón no encontrado');
    }

    const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('REDIRECT_URI');
    const scope = 'https://graph.microsoft.com/Mail.Send offline_access';

    const params = new URLSearchParams({
      client_id: clientId!,
      response_type: 'code',
      redirect_uri: redirectUri!,
      scope,
      state: mailboxId,
      response_mode: 'query',
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, mailboxId: string): Promise<{ email: string; message: string }> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });

    if (!mailbox) {
      throw new BadRequestException('Buzón no encontrado (state inválido)');
    }

    const tokens = await this.exchangeCodeForTokens(code);

    await this.prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        consentGiven: true,
        active: true,
      },
    });

    this.logger.log(`Consentimiento otorgado y tokens almacenados para ${mailbox.email}`);

    return {
      email: mailbox.email,
      message: `Consentimiento otorgado correctamente para ${mailbox.email}. Ya puede enviar correos.`,
    };
  }

  async refreshAccessToken(mailboxId: string): Promise<string> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });

    if (!mailbox?.refreshToken) {
      throw new BadRequestException('No hay refresh token disponible. Se requiere consentimiento nuevamente.');
    }

    const tokens = await this.exchangeRefreshToken(mailbox.refreshToken);

    await this.prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? mailbox.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return tokens.access_token;
  }

  async getValidAccessToken(mailboxId: string): Promise<string> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });

    if (!mailbox) {
      throw new BadRequestException('Buzón no encontrado');
    }

    if (!mailbox.consentGiven || !mailbox.accessToken) {
      throw new BadRequestException(
        `El buzón ${mailbox.email} no ha completado el consentimiento OAuth2. ` +
        `Use el endpoint de consentimiento para autorizarlo.`,
      );
    }

    const marginMs = 5 * 60 * 1000; // 5 minutes margin
    if (mailbox.tokenExpiresAt && new Date(mailbox.tokenExpiresAt.getTime() - marginMs) > new Date()) {
      return mailbox.accessToken;
    }

    this.logger.log(`Token expirado para ${mailbox.email}, refrescando...`);
    return this.refreshAccessToken(mailboxId);
  }

  private async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('REDIRECT_URI');

    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          code,
          redirect_uri: redirectUri!,
          grant_type: 'authorization_code',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      this.logger.error(`Error exchanging code for tokens: ${JSON.stringify(error)}`);

      if (error.error === 'AADSTS65001' || error.error === 'consent_required') {
        throw new BadRequestException(
          'Se requiere consentimiento del administrador del tenant. ' +
          'El tenant tiene deshabilitado el consentimiento de usuario.',
        );
      }

      throw new BadRequestException(
        `Error al obtener tokens: ${error.error_description || error.error || 'Error desconocido'}`,
      );
    }

    return response.json();
  }

  private async exchangeRefreshToken(refreshToken: string): Promise<TokenResponse> {
    const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET');

    const response = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      this.logger.error(`Error refreshing token: ${JSON.stringify(error)}`);
      throw new BadRequestException(
        `Error al refrescar token. Se requiere consentimiento nuevamente: ${error.error_description || error.error}`,
      );
    }

    return response.json();
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}
