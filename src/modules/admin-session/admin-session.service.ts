import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AdminSessionConfig } from './admin-session.config';

export const ADMIN_SESSION_COOKIE = 'mail_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger(AdminSessionService.name);

  constructor(
    private config: AdminSessionConfig,
    private jwtService: JwtService,
  ) {}

  /** Returns a signed session token, or throws a generic 401 that does not reveal which field failed. */
  async login(username: string, password: string, ip: string | undefined): Promise<string> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Administración web no configurada');
    }

    // Both checks always run so the response time does not reveal whether the username exists
    const usernameOk = crypto.timingSafeEqual(digest(username), digest(this.config.username));
    const passwordOk = await bcrypt.compare(password, this.config.passwordHash);

    if (!usernameOk || !passwordOk) {
      this.logger.warn(`Intento de inicio de sesión fallido desde ${ip ?? 'IP desconocida'}`);
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    return this.jwtService.signAsync(
      { sub: this.config.username },
      { secret: this.config.secret, expiresIn: ADMIN_SESSION_TTL_SECONDS, algorithm: 'HS256' },
    );
  }

  /** Username of a valid session token, or null for missing, altered, expired or foreign tokens. */
  async verify(token: string | undefined): Promise<string | null> {
    if (!token || !this.config.enabled) return null;

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: this.config.secret,
        algorithms: ['HS256'],
      });
      // Changing ADMIN_USERNAME invalidates existing sessions
      return payload.sub === this.config.username ? payload.sub : null;
    } catch {
      return null;
    }
  }
}

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}
