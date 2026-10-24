import * as bcrypt from 'bcrypt';
import { Controller, Get, INestApplication, Logger, Post, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AdminSessionModule } from './admin-session.module';
import { ADMIN_SESSION_COOKIE } from './admin-session.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RequireAdmin } from '../../common/decorators/admin.decorator';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

@Controller('probe')
class ProbeController {
  @Get()
  @RequireAdmin()
  read() {
    return 'ok';
  }

  @Post()
  @RequireAdmin()
  write() {
    return 'ok';
  }
}

describe('Sesión del administrador y AdminGuard', () => {
  const USERNAME = 'admin';
  const PASSWORD = 'contraseña-de-prueba-segura';
  const SECRET = 's'.repeat(40);
  const ADMIN_KEY = 'admin-api-key-de-prueba';
  const passwordHash = bcrypt.hashSync(PASSWORD, 4);

  let app: INestApplication;
  let logs: string[];

  const env = (overrides: Record<string, string | undefined> = {}) => {
    const values = {
      ADMIN_USERNAME: USERNAME,
      ADMIN_PASSWORD_HASH: passwordHash,
      ADMIN_SESSION_SECRET: SECRET,
      ADMIN_API_KEY: ADMIN_KEY,
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  const start = async (overrides: Record<string, string | undefined> = {}) => {
    env(overrides);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AdminSessionModule],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: AdminGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  };

  const http = () => request(app.getHttpServer());
  const login = (username = USERNAME, password = PASSWORD) =>
    http().post('/admin-session/login').send({ username, password });
  const sessionCookie = async () => {
    const res = await login().expect(200);
    return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  };
  const signed = (payload: object, secret = SECRET) =>
    `${ADMIN_SESSION_COOKIE}=${new JwtService().sign(payload, { secret })}`;

  beforeEach(() => {
    logs = [];
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((message: unknown) => {
        logs.push(String(message));
      });
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  describe('inicio de sesión', () => {
    beforeEach(() => start());

    it('emite una cookie httpOnly, SameSite=Strict y de 8 horas', async () => {
      const res = await login().expect(200);

      expect(res.body.data).toEqual({ username: USERNAME });
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(new RegExp(`^${ADMIN_SESSION_COOKIE}=`));
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Max-Age=28800');
      expect(cookie).not.toContain('Secure'); // servido por HTTP en la prueba
      expect(cookie).not.toContain(PASSWORD);
    });

    it('responde 401 genérico con contraseña incorrecta, sin cookie', async () => {
      const res = await login(USERNAME, 'otra-contraseña').expect(401);
      expect(res.body.message).toBe('Usuario o contraseña incorrectos');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('responde igual con un usuario inexistente', async () => {
      const wrongPassword = await login(USERNAME, 'otra-contraseña').expect(401);
      const wrongUser = await login('intruso', PASSWORD).expect(401);
      expect(wrongUser.body.message).toBe(wrongPassword.body.message);
      expect(wrongUser.body.statusCode).toBe(wrongPassword.body.statusCode);
    });

    it('responde 400 si falta la contraseña', async () => {
      await http().post('/admin-session/login').send({ username: USERNAME }).expect(400);
    });

    it('responde 429 al sexto intento del minuto, aunque las credenciales sean correctas', async () => {
      for (let i = 0; i < 5; i++) await login(USERNAME, 'mal').expect(401);
      await login().expect(429);
    });

    it('no registra la contraseña en logs', async () => {
      await login(USERNAME, 'contraseña-que-no-debe-aparecer').expect(401);
      expect(logs.some((l) => l.includes('Intento de inicio de sesión fallido'))).toBe(true);
      expect(logs.join('\n')).not.toContain('contraseña-que-no-debe-aparecer');
    });
  });

  describe('configuración incompleta o inválida', () => {
    it.each([
      ['falta el hash', { ADMIN_PASSWORD_HASH: undefined }, 'ADMIN_PASSWORD_HASH'],
      ['hash inválido', { ADMIN_PASSWORD_HASH: 'texto-plano' }, 'ADMIN_PASSWORD_HASH'],
      ['secreto corto', { ADMIN_SESSION_SECRET: 'corto' }, 'ADMIN_SESSION_SECRET'],
      ['falta el usuario', { ADMIN_USERNAME: undefined }, 'ADMIN_USERNAME'],
    ])('%s: login responde 503 y el resto sigue funcionando', async (_, overrides, variable) => {
      await start(overrides);

      const res = await login().expect(503);
      expect(res.body.message).toBe('Administración web no configurada');
      const warning = logs.find((l) => l.includes('Administración web deshabilitada'))!;
      expect(warning).toContain(variable);
      expect(warning).not.toContain(passwordHash);
      expect(warning).not.toContain('texto-plano');

      await http().get('/probe').set('x-admin-api-key', ADMIN_KEY).expect(200);
    });
  });

  describe('sesión', () => {
    beforeEach(() => start());

    it('me devuelve solo el usuario con una sesión válida', async () => {
      const res = await http().get('/admin-session/me').set('Cookie', await sessionCookie()).expect(200);
      expect(res.body.data).toEqual({ username: USERNAME });
    });

    it('me responde 401 sin sesión', async () => {
      await http().get('/admin-session/me').expect(401);
    });

    it.each([
      ['caducada', () => signed({ sub: USERNAME, exp: Math.floor(Date.now() / 1000) - 10 })],
      ['firmada con otro secreto', () => signed({ sub: USERNAME }, 'x'.repeat(40))],
      ['de otro usuario', () => signed({ sub: 'otro' })],
    ])('rechaza una cookie %s', async (_, cookie) => {
      await http().get('/admin-session/me').set('Cookie', cookie()).expect(401);
    });

    it('rechaza una cookie alterada', async () => {
      const cookie = await sessionCookie();
      const tampered = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');
      await http().get('/admin-session/me').set('Cookie', tampered).expect(401);
    });

    it('logout elimina la cookie', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/admin-session/login').send({ username: USERNAME, password: PASSWORD }).expect(200);
      await agent.get('/admin-session/me').expect(200);

      const res = await agent.post('/admin-session/logout').expect(200);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
      await agent.get('/admin-session/me').expect(401);
    });
  });

  describe('AdminGuard', () => {
    beforeEach(() => start());

    it('acepta la API key válida', async () => {
      await http().get('/probe').set('x-admin-api-key', ADMIN_KEY).expect(200);
    });

    it('rechaza sin credenciales', async () => {
      const res = await http().get('/probe').expect(401);
      expect(res.body.message).toBe('Header x-admin-api-key es requerido');
    });

    it('rechaza una API key incorrecta', async () => {
      const res = await http().get('/probe').set('x-admin-api-key', 'incorrecta').expect(401);
      expect(res.body.message).toBe('Admin API Key inválida');
    });

    it('rechaza una API key incorrecta aunque haya sesión válida', async () => {
      await http()
        .get('/probe')
        .set('Cookie', await sessionCookie())
        .set('x-admin-api-key', 'incorrecta')
        .expect(401);
    });

    it('acepta la sesión en GET sin X-Admin-UI', async () => {
      await http().get('/probe').set('Cookie', await sessionCookie()).expect(200);
    });

    it('rechaza con 403 un POST con sesión y sin X-Admin-UI', async () => {
      await http().post('/probe').set('Cookie', await sessionCookie()).expect(403);
    });

    it('acepta un POST con sesión y X-Admin-UI: 1', async () => {
      await http().post('/probe').set('Cookie', await sessionCookie()).set('X-Admin-UI', '1').expect(201);
    });

    it('acepta un POST con API key sin X-Admin-UI', async () => {
      await http().post('/probe').set('x-admin-api-key', ADMIN_KEY).expect(201);
    });
  });
});
