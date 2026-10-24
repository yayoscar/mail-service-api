import * as crypto from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { TokenCipher } from './token-cipher';

describe('TokenCipher', () => {
  const createCipher = (key: string | undefined) => {
    const cipher = new TokenCipher({ get: () => key } as unknown as ConfigService);
    cipher.onModuleInit();
    return cipher;
  };

  const validKey = crypto.randomBytes(32).toString('base64');

  it('cifra y descifra un token', () => {
    const cipher = createCipher(validKey);
    const encrypted = cipher.encrypt('eyJ0eXAiOiJKV1Qi.token-de-acceso');

    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain('token-de-acceso');
    expect(cipher.decrypt(encrypted)).toBe('eyJ0eXAiOiJKV1Qi.token-de-acceso');
  });

  it('genera un IV distinto en cada cifrado', () => {
    const cipher = createCipher(validKey);
    expect(cipher.encrypt('mismo')).not.toBe(cipher.encrypt('mismo'));
  });

  it('rechaza un texto cifrado alterado', () => {
    const cipher = createCipher(validKey);
    const encrypted = cipher.encrypt('token');
    const parts = encrypted.split(':');
    const ciphertext = Buffer.from(parts[4], 'base64');
    ciphertext[0] ^= 0xff;
    parts[4] = ciphertext.toString('base64');

    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
  });

  it('rechaza descifrar con otra clave', () => {
    const encrypted = createCipher(validKey).encrypt('token');
    const other = createCipher(crypto.randomBytes(32).toString('base64'));

    expect(() => other.decrypt(encrypted)).toThrow();
  });

  it('devuelve tal cual un valor heredado sin cifrar', () => {
    expect(createCipher(validKey).decrypt('token-heredado')).toBe('token-heredado');
  });

  it('falla si la clave no está configurada', () => {
    expect(() => createCipher(undefined)).toThrow('TOKEN_ENCRYPTION_KEY no está configurada');
  });

  it('falla si la clave no tiene 32 bytes', () => {
    expect(() => createCipher(crypto.randomBytes(16).toString('base64'))).toThrow(
      'TOKEN_ENCRYPTION_KEY debe contener 32 bytes',
    );
  });
});
