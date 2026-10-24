import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Encrypts OAuth tokens at rest with AES-256-GCM.
 * Stored format: enc:v1:<iv>:<authTag>:<ciphertext>, each part in base64.
 */
@Injectable()
export class TokenCipher implements OnModuleInit {
  private readonly logger = new Logger(TokenCipher.name);
  private key: Buffer;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.key = TokenCipher.parseKey(this.configService.get<string>('TOKEN_ENCRYPTION_KEY'));
  }

  static parseKey(value: string | undefined): Buffer {
    if (!value) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY no está configurada. Genérela con: openssl rand -base64 32',
      );
    }

    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY debe contener 32 bytes codificados en base64');
    }
    return key;
  }

  static isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plain: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(stored: string): string {
    if (!TokenCipher.isEncrypted(stored)) {
      // Legacy plaintext value, accepted until the encryption script has run
      this.logger.warn('Se leyó un token sin cifrar; ejecute npm run tokens:encrypt');
      return stored;
    }

    const [iv, tag, ciphertext] = stored
      .slice(PREFIX.length)
      .split(':')
      .map((part) => Buffer.from(part, 'base64'));

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
