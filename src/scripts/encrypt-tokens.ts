/**
 * Encrypts the OAuth tokens stored in plaintext before harden-oauth-consent and lists the
 * authorized mailboxes for review. Idempotent: values already encrypted are left untouched.
 *
 *   npm run tokens:encrypt                # encrypt legacy plaintext tokens
 *   npm run tokens:encrypt -- --decrypt   # rollback: back to plaintext for the previous version
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../config/prisma.module';
import { PrismaService } from '../config/prisma.service';
import { TokenCipher } from '../common/crypto/token-cipher';

@Module({
  imports: [AppConfigModule, PrismaModule],
  providers: [TokenCipher],
})
class TokenScriptModule {}

async function main() {
  const decryptMode = process.argv.includes('--decrypt');
  const app = await NestFactory.createApplicationContext(TokenScriptModule, {
    logger: ['error'],
  });

  try {
    const prisma = app.get(PrismaService);
    const cipher = app.get(TokenCipher);

    const convert = (value: string | null): string | null => {
      if (!value) return value;
      if (decryptMode) {
        return TokenCipher.isEncrypted(value) ? cipher.decrypt(value) : value;
      }
      return TokenCipher.isEncrypted(value) ? value : cipher.encrypt(value);
    };

    const mailboxes = await prisma.mailbox.findMany({
      where: { OR: [{ accessToken: { not: null } }, { refreshToken: { not: null } }] },
      omit: { accessToken: false, refreshToken: false },
    });

    let updated = 0;
    for (const mailbox of mailboxes) {
      const accessToken = convert(mailbox.accessToken);
      const refreshToken = convert(mailbox.refreshToken);

      if (accessToken !== mailbox.accessToken || refreshToken !== mailbox.refreshToken) {
        await prisma.mailbox.update({
          where: { id: mailbox.id },
          data: { accessToken, refreshToken },
        });
        updated++;
      }
    }

    const action = decryptMode ? 'descifrados' : 'cifrados';
    console.log(`Buzones con tokens: ${mailboxes.length}. Buzones ${action} en esta ejecución: ${updated}.`);

    if (decryptMode) return;

    const authorized = await prisma.mailbox.findMany({
      where: { consentGiven: true },
      include: { system: { select: { key: true } } },
      orderBy: [{ system: { key: 'asc' } }, { email: 'asc' }],
    });

    console.log(
      '\nBuzones autorizados antes de la verificación de identidad. Revise que cada uno haya sido' +
        '\nautorizado por la cuenta correcta; si duda de alguno, emita un enlace de consentimiento nuevo.\n',
    );
    console.table(
      authorized.map((mailbox) => ({
        sistema: mailbox.system.key,
        buzon: mailbox.email,
        activo: mailbox.active,
        id: mailbox.id,
      })),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
