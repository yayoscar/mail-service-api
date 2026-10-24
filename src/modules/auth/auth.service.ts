import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { TokenCipher } from '../../common/crypto/token-cipher';

const CONSENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;
const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
// openid/email/profile identify the account that grants consent (id_token)
const CONSENT_SCOPE = 'https://graph.microsoft.com/Mail.Send offline_access openid email profile';
// Refresh keeps the original scope so legacy refresh tokens (granted without openid) keep working
const REFRESH_SCOPE = 'https://graph.microsoft.com/Mail.Send offline_access';

const INVALID_LINK =
  'El enlace de consentimiento no es válido. Solicite uno nuevo al administrador.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private tokenCipher: TokenCipher,
  ) {}

  async createConsentLink(mailboxId: string): Promise<{ url: string; expiresAt: Date }> {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });

    if (!mailbox) {
      throw new NotFoundException(`Buzón con id '${mailboxId}' no encontrado`);
    }
    if (!mailbox.active) {
      throw new BadRequestException('No se puede emitir un enlace de consentimiento para un buzón inactivo');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CONSENT_LINK_TTL_MS);

    // A new link invalidates the pending ones for the same mailbox
    await this.prisma.$transaction([
      this.prisma.consentRequest.deleteMany({ where: { mailboxId, usedAt: null } }),
      this.prisma.consentRequest.create({
        data: { mailboxId, tokenHash: sha256(token), expiresAt },
      }),
    ]);

    const url = new URL('/auth/consent', this.configService.get<string>('REDIRECT_URI'));
    url.searchParams.set('token', token);

    return { url: url.toString(), expiresAt };
  }

  async getConsentUrl(token: string | undefined): Promise<string> {
    if (!token) {
      throw new BadRequestException(INVALID_LINK);
    }

    const request = await this.prisma.consentRequest.findUnique({
      where: { tokenHash: sha256(token) },
      include: { mailbox: true },
    });
    assertUsable(request);

    const state = crypto.randomBytes(32).toString('base64url');
    await this.prisma.consentRequest.update({ where: { id: request.id }, data: { state } });

    const params = new URLSearchParams({
      client_id: this.configService.get<string>('AZURE_CLIENT_ID')!,
      response_type: 'code',
      redirect_uri: this.configService.get<string>('REDIRECT_URI')!,
      scope: CONSENT_SCOPE,
      state,
      response_mode: 'query',
      login_hint: request.mailbox.email,
    });

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<{ email: string; message: string }> {
    const request = await this.prisma.consentRequest.findUnique({
      where: { state },
      include: { mailbox: true },
    });
    assertUsable(request);
    const { mailbox } = request;

    const tokens = await this.exchangeCodeForTokens(code);

    const identities = accountIdentities(tokens.id_token);
    if (!identities.includes(mailbox.email.toLowerCase())) {
      this.logger.warn(`Consentimiento rechazado para ${mailbox.email}: la cuenta no coincide`);
      throw new BadRequestException(
        `Debe iniciar sesión con la cuenta ${mailbox.email}. ` +
          `La cuenta utilizada fue ${identities[0] ?? 'desconocida'}. ` +
          `Vuelva a abrir el enlace e inicie sesión con la cuenta correcta.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Marking the request as used first prevents two callbacks from completing with the same state
      const { count } = await tx.consentRequest.updateMany({
        where: { id: request.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count === 0) {
        throw new BadRequestException(INVALID_LINK);
      }

      await tx.mailbox.update({
        where: { id: mailbox.id },
        data: {
          accessToken: this.tokenCipher.encrypt(tokens.access_token),
          refreshToken: tokens.refresh_token ? this.tokenCipher.encrypt(tokens.refresh_token) : null,
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          consentGiven: true,
        },
      });
    });

    this.logger.log(`Consentimiento otorgado y tokens almacenados para ${mailbox.email}`);

    return {
      email: mailbox.email,
      message: `Consentimiento otorgado correctamente para ${mailbox.email}. Ya puede enviar correos.`,
    };
  }

  async refreshAccessToken(mailboxId: string): Promise<string> {
    const mailbox = await this.prisma.mailbox.findUnique({
      where: { id: mailboxId },
      omit: { refreshToken: false },
    });

    if (!mailbox?.refreshToken) {
      throw new BadRequestException('No hay refresh token disponible. Se requiere consentimiento nuevamente.');
    }

    const tokens = await this.exchangeRefreshToken(this.tokenCipher.decrypt(mailbox.refreshToken));

    await this.prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        accessToken: this.tokenCipher.encrypt(tokens.access_token),
        // Re-encrypting the kept token also migrates a legacy plaintext value
        refreshToken: this.tokenCipher.encrypt(
          tokens.refresh_token ?? this.tokenCipher.decrypt(mailbox.refreshToken),
        ),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return tokens.access_token;
  }

  async getValidAccessToken(mailboxId: string): Promise<string> {
    const mailbox = await this.prisma.mailbox.findUnique({
      where: { id: mailboxId },
      omit: { accessToken: false },
    });

    if (!mailbox) {
      throw new BadRequestException('Buzón no encontrado');
    }

    if (!mailbox.consentGiven || !mailbox.accessToken) {
      throw new BadRequestException(
        `El buzón ${mailbox.email} no ha completado el consentimiento OAuth2. ` +
        `Solicite al administrador un enlace de consentimiento para autorizarlo.`,
      );
    }

    const marginMs = 5 * 60 * 1000; // 5 minutes margin
    if (mailbox.tokenExpiresAt && new Date(mailbox.tokenExpiresAt.getTime() - marginMs) > new Date()) {
      return this.tokenCipher.decrypt(mailbox.accessToken);
    }

    this.logger.log(`Token expirado para ${mailbox.email}, refrescando...`);
    return this.refreshAccessToken(mailboxId);
  }

  private async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('REDIRECT_URI');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
        scope: CONSENT_SCOPE,
      }),
    });

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

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: REFRESH_SCOPE,
      }),
    });

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
  id_token?: string;
  expires_in: number;
  token_type: string;
}

type ConsentRequestWithMailbox = {
  id: string;
  expiresAt: Date;
  usedAt: Date | null;
  mailbox: { id: string; email: string };
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assertUsable<T extends ConsentRequestWithMailbox>(request: T | null): asserts request is T {
  if (!request || request.usedAt) {
    throw new BadRequestException(INVALID_LINK);
  }
  if (request.expiresAt <= new Date()) {
    throw new BadRequestException(
      'El enlace de consentimiento caducó. Solicite uno nuevo al administrador.',
    );
  }
}

/**
 * Lower-cased addresses that identify the consenting account. The id_token comes straight
 * from the token endpoint over TLS, so its signature does not need to be verified
 * (OpenID Connect Core 3.1.3.7).
 */
function accountIdentities(idToken: string | undefined): string[] {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException(
      'Microsoft no devolvió la identidad de la cuenta. Verifique que la aplicación tenga los permisos openid, email y profile.',
    );
  }

  return ['email', 'preferred_username', 'upn']
    .map((claim) => claims[claim])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLowerCase());
}
