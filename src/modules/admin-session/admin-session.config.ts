import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const MIN_SECRET_LENGTH = 32;

/**
 * Credentials of the single web administrator, read from the environment.
 * Missing or invalid values disable web login without stopping the service.
 */
@Injectable()
export class AdminSessionConfig implements OnModuleInit {
  private readonly logger = new Logger(AdminSessionConfig.name);

  enabled = false;
  username = '';
  passwordHash = '';
  secret = '';

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const username = this.configService.get<string>('ADMIN_USERNAME') ?? '';
    const passwordHash = this.configService.get<string>('ADMIN_PASSWORD_HASH') ?? '';
    const secret = this.configService.get<string>('ADMIN_SESSION_SECRET') ?? '';

    const problems: string[] = [];
    if (!username) problems.push('ADMIN_USERNAME (falta)');
    if (!BCRYPT_HASH.test(passwordHash)) {
      problems.push(passwordHash ? 'ADMIN_PASSWORD_HASH (no es un hash bcrypt)' : 'ADMIN_PASSWORD_HASH (falta)');
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      problems.push(
        secret
          ? `ADMIN_SESSION_SECRET (menos de ${MIN_SECRET_LENGTH} caracteres)`
          : 'ADMIN_SESSION_SECRET (falta)',
      );
    }

    if (problems.length > 0) {
      this.logger.warn(`Administración web deshabilitada. Revise: ${problems.join(', ')}`);
      return;
    }

    Object.assign(this, { enabled: true, username, passwordHash, secret });
  }
}
