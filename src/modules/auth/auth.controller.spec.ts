import * as crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenCipher } from '../../common/crypto/token-cipher';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../config/prisma.service';
import { AdminSessionService } from '../admin-session/admin-session.service';

type Mailbox = {
  id: string;
  email: string;
  active: boolean;
  consentGiven: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
};

type ConsentRequest = {
  id: string;
  mailboxId: string;
  tokenHash: string;
  state: string | null;
  expiresAt: Date;
  usedAt: Date | null;
};

/** In-memory stand-in for the subset of Prisma used by AuthService. */
function createFakePrisma() {
  const mailboxes = new Map<string, Mailbox>();
  const requests = new Map<string, ConsentRequest>();
  const withMailbox = (r?: ConsentRequest) =>
    r ? { ...r, mailbox: { ...mailboxes.get(r.mailboxId)! } } : null;

  const prisma = {
    mailboxes,
    requests,
    mailbox: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const mailbox = mailboxes.get(where.id);
        return mailbox ? { ...mailbox } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Mailbox> }) => {
        const mailbox = { ...mailboxes.get(where.id)!, ...data };
        mailboxes.set(where.id, mailbox);
        return mailbox;
      },
    },
    consentRequest: {
      deleteMany: async ({ where }: { where: { mailboxId: string } }) => {
        for (const [id, r] of requests) {
          if (r.mailboxId === where.mailboxId && !r.usedAt) requests.delete(id);
        }
      },
      create: async ({ data }: { data: Omit<ConsentRequest, 'id' | 'state' | 'usedAt'> }) => {
        const r = { id: crypto.randomUUID(), state: null, usedAt: null, ...data };
        requests.set(r.id, r);
        return r;
      },
      findUnique: async ({ where }: { where: { tokenHash?: string; state?: string } }) =>
        withMailbox(
          [...requests.values()].find((r) =>
            where.tokenHash ? r.tokenHash === where.tokenHash : r.state === where.state,
          ),
        ),
      update: async ({ where, data }: { where: { id: string }; data: Partial<ConsentRequest> }) => {
        const r = { ...requests.get(where.id)!, ...data };
        requests.set(where.id, r);
        return r;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: Partial<ConsentRequest> }) => {
        const r = requests.get(where.id);
        if (!r || r.usedAt) return { count: 0 };
        requests.set(where.id, { ...r, ...data });
        return { count: 1 };
      },
    },
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  };
  return prisma;
}

const idToken = (claims: Record<string, unknown>) =>
  ['{"alg":"RS256"}', JSON.stringify(claims), 'firma']
    .map((part) => Buffer.from(part).toString('base64url'))
    .join('.');

describe('Flujo de consentimiento OAuth2', () => {
  const ADMIN_KEY = 'admin-test-key';
  const MAILBOX_EMAIL = 'controlgestion@dgeti.gob.mx';

  let app: INestApplication;
  let prisma: ReturnType<typeof createFakePrisma>;
  let fetchMock: jest.SpyInstance;

  const tokenResponse = (claims: Record<string, unknown>) =>
    new Response(
      JSON.stringify({
        access_token: 'access-token-secreto',
        refresh_token: 'refresh-token-secreto',
        id_token: idToken(claims),
        expires_in: 3600,
        token_type: 'Bearer',
      }),
      { status: 200 },
    );

  const http = () => request(app.getHttpServer());

  const issueLink = async () => {
    const res = await http()
      .post('/mailboxes/mb-1/consent-link')
      .set('x-admin-api-key', ADMIN_KEY)
      .expect(201);
    return new URL(res.body.url as string).searchParams.get('token')!;
  };

  const openLink = async (token: string) => {
    const res = await http().get(`/auth/consent?token=${encodeURIComponent(token)}`).expect(302);
    return new URL(res.headers.location);
  };

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.AZURE_CLIENT_ID = 'client-id';
    process.env.AZURE_CLIENT_SECRET = 'client-secret';
    process.env.REDIRECT_URI = 'https://mail.example.test/auth/callback';
  });

  beforeEach(async () => {
    prisma = createFakePrisma();
    prisma.mailboxes.set('mb-1', {
      id: 'mb-1',
      email: MAILBOX_EMAIL,
      active: true,
      consentGiven: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [AuthController],
      providers: [
        AuthService,
        TokenCipher,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminSessionService, useValue: { verify: () => Promise.resolve(null) } },
        { provide: APP_GUARD, useClass: AdminGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(async () => {
    fetchMock.mockRestore();
    await app.close();
  });

  describe('emisión de enlaces', () => {
    it('emite una URL con token y expiración a 24 horas', async () => {
      const res = await http()
        .post('/mailboxes/mb-1/consent-link')
        .set('x-admin-api-key', ADMIN_KEY)
        .expect(201);

      const url = new URL(res.body.url as string);
      expect(url.origin + url.pathname).toBe('https://mail.example.test/auth/consent');
      expect(url.searchParams.get('token')).toMatch(/^[\w-]{43}$/);
      const ttl = new Date(res.body.expiresAt as string).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(23.9 * 3600 * 1000);
      expect(ttl).toBeLessThanOrEqual(24 * 3600 * 1000);
    });

    it('guarda solo el hash del token', async () => {
      const token = await issueLink();
      const [stored] = prisma.requests.values();
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    });

    it('rechaza sin credenciales de administrador', async () => {
      await http().post('/mailboxes/mb-1/consent-link').expect(401);
    });

    it('responde 404 si el buzón no existe', async () => {
      await http().post('/mailboxes/nope/consent-link').set('x-admin-api-key', ADMIN_KEY).expect(404);
    });

    it('responde 400 si el buzón está inactivo', async () => {
      prisma.mailboxes.get('mb-1')!.active = false;
      await http().post('/mailboxes/mb-1/consent-link').set('x-admin-api-key', ADMIN_KEY).expect(400);
      expect(prisma.requests.size).toBe(0);
    });

    it('un enlace nuevo invalida el anterior', async () => {
      const first = await issueLink();
      await issueLink();

      const res = await http().get(`/auth/consent?token=${first}`).expect(400);
      expect(res.text).toContain('no es válido');
    });
  });

  describe('inicio del consentimiento', () => {
    it('redirige a Microsoft con login_hint, scopes OpenID y un state opaco', async () => {
      const location = await openLink(await issueLink());

      expect(location.origin + location.pathname).toBe(
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      );
      expect(location.searchParams.get('login_hint')).toBe(MAILBOX_EMAIL);
      expect(location.searchParams.get('scope')).toBe(
        'https://graph.microsoft.com/Mail.Send offline_access openid email profile',
      );
      const state = location.searchParams.get('state')!;
      expect(state).toMatch(/^[\w-]{43}$/);
      expect(state).not.toContain('mb-1');
    });

    it('rechaza el acceso con mailboxId y sin token', async () => {
      const res = await http().get('/auth/consent?mailboxId=mb-1').expect(400);
      expect(res.headers.location).toBeUndefined();
    });

    it('rechaza un enlace caducado', async () => {
      const token = await issueLink();
      const [stored] = prisma.requests.values();
      stored.expiresAt = new Date(Date.now() - 1000);

      const res = await http().get(`/auth/consent?token=${token}`).expect(400);
      expect(res.text).toContain('caducó');
    });

    it('rechaza un enlace cuyo buzón ya no existe', async () => {
      const token = await issueLink();
      prisma.requests.clear(); // ON DELETE CASCADE al borrar el buzón
      await http().get(`/auth/consent?token=${token}`).expect(400);
    });
  });

  describe('callback', () => {
    it('guarda los tokens cifrados con la cuenta correcta, sin distinguir mayúsculas', async () => {
      const state = (await openLink(await issueLink())).searchParams.get('state')!;
      fetchMock.mockResolvedValueOnce(
        tokenResponse({ preferred_username: 'ControlGestion@DGETI.gob.mx' }),
      );

      const res = await http().get(`/auth/callback?code=abc&state=${state}`).expect(200);
      expect(res.text).toContain('Consentimiento exitoso');

      const mailbox = prisma.mailboxes.get('mb-1')!;
      expect(mailbox.consentGiven).toBe(true);
      expect(mailbox.accessToken).toMatch(/^enc:v1:/);
      expect(mailbox.refreshToken).toMatch(/^enc:v1:/);
      expect(mailbox.accessToken).not.toContain('access-token-secreto');
      const [stored] = prisma.requests.values();
      expect(stored.usedAt).toBeInstanceOf(Date);

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams);
      expect(body.get('scope')).toContain('openid email profile');
    });

    it('rechaza una cuenta distinta sin modificar el buzón y permite reintentar', async () => {
      const token = await issueLink();
      const state = (await openLink(token)).searchParams.get('state')!;
      fetchMock.mockResolvedValueOnce(tokenResponse({ email: 'otra@dgeti.gob.mx' }));

      const res = await http().get(`/auth/callback?code=abc&state=${state}`).expect(400);
      expect(res.text).toContain(`Debe iniciar sesión con la cuenta ${MAILBOX_EMAIL}`);
      expect(res.text).toContain('otra@dgeti.gob.mx');
      expect(prisma.mailboxes.get('mb-1')).toMatchObject({ consentGiven: false, accessToken: null });

      await openLink(token);
    });

    it('rechaza un state desconocido sin contactar a Microsoft', async () => {
      await http().get('/auth/callback?code=abc&state=inventado').expect(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rechaza reutilizar un state y abrir un enlace ya utilizado', async () => {
      const token = await issueLink();
      const state = (await openLink(token)).searchParams.get('state')!;
      fetchMock.mockResolvedValueOnce(tokenResponse({ email: MAILBOX_EMAIL }));
      await http().get(`/auth/callback?code=abc&state=${state}`).expect(200);

      await http().get(`/auth/callback?code=otro&state=${state}`).expect(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await http().get(`/auth/consent?token=${token}`).expect(400);
    });

    it('rechaza la respuesta sin id_token', async () => {
      const state = (await openLink(await issueLink())).searchParams.get('state')!;
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }), { status: 200 }),
      );

      const res = await http().get(`/auth/callback?code=abc&state=${state}`).expect(400);
      expect(res.text).toContain('no devolvió la identidad de la cuenta');
    });

    it('escapa el HTML de error_description', async () => {
      const res = await http()
        .get(`/auth/callback?error=access_denied&error_description=${encodeURIComponent('<script>alert(1)</script>')}`)
        .expect(400);

      expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(res.text).not.toContain('<script>');
    });

    it('no reactiva un buzón desactivado tras emitir el enlace', async () => {
      const state = (await openLink(await issueLink())).searchParams.get('state')!;
      prisma.mailboxes.get('mb-1')!.active = false;
      fetchMock.mockResolvedValueOnce(tokenResponse({ email: MAILBOX_EMAIL }));

      await http().get(`/auth/callback?code=abc&state=${state}`).expect(200);
      expect(prisma.mailboxes.get('mb-1')).toMatchObject({ consentGiven: true, active: false });
    });
  });

  describe('uso de los tokens', () => {
    let service: AuthService;
    let cipher: TokenCipher;

    beforeEach(() => {
      service = app.get(AuthService);
      cipher = app.get(TokenCipher);
    });

    it('descifra el token vigente sin contactar a Microsoft', async () => {
      Object.assign(prisma.mailboxes.get('mb-1')!, {
        consentGiven: true,
        accessToken: cipher.encrypt('vigente'),
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      });

      await expect(service.getValidAccessToken('mb-1')).resolves.toBe('vigente');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('acepta un token heredado sin cifrar', async () => {
      Object.assign(prisma.mailboxes.get('mb-1')!, {
        consentGiven: true,
        accessToken: 'heredado',
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      });

      await expect(service.getValidAccessToken('mb-1')).resolves.toBe('heredado');
    });

    it('renueva un token por expirar y guarda cifrado el refresh token conservado', async () => {
      Object.assign(prisma.mailboxes.get('mb-1')!, {
        consentGiven: true,
        accessToken: cipher.encrypt('viejo'),
        refreshToken: 'refresh-heredado',
        tokenExpiresAt: new Date(Date.now() + 60 * 1000),
      });
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'nuevo', expires_in: 3600 }), { status: 200 }),
      );

      await expect(service.getValidAccessToken('mb-1')).resolves.toBe('nuevo');

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as URLSearchParams);
      expect(body.get('refresh_token')).toBe('refresh-heredado');
      expect(body.get('scope')).toBe('https://graph.microsoft.com/Mail.Send offline_access');
      const mailbox = prisma.mailboxes.get('mb-1')!;
      expect(cipher.decrypt(mailbox.accessToken!)).toBe('nuevo');
      expect(mailbox.refreshToken).toMatch(/^enc:v1:/);
      expect(cipher.decrypt(mailbox.refreshToken!)).toBe('refresh-heredado');
    });
  });
});
