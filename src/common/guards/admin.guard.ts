import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_ADMIN_KEY } from '../decorators/admin.decorator';
import { AdminSessionService } from '../../modules/admin-session/admin-session.service';
import { sessionCookie } from '../../modules/admin-session/admin-session.controller';
import * as crypto from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Admin endpoints accept either the x-admin-api-key header (scripts) or the web
 * administrator session cookie. Cookie-authenticated writes must carry X-Admin-UI: 1
 * as CSRF protection.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
    private sessionService: AdminSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireAdmin = this.reflector.getAllAndOverride<boolean>(REQUIRE_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireAdmin) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-admin-api-key'];

    // A key that is present is always checked, even if a valid session also exists
    if (providedKey) {
      this.assertValidKey(providedKey);
      return true;
    }

    const username = await this.sessionService.verify(sessionCookie(request));
    if (!username) {
      throw new UnauthorizedException('Header x-admin-api-key es requerido');
    }

    if (!SAFE_METHODS.has(request.method) && request.headers['x-admin-ui'] !== '1') {
      throw new ForbiddenException('Falta la cabecera X-Admin-UI en una petición con sesión');
    }

    return true;
  }

  private assertValidKey(providedKey: string | string[]) {
    const adminKey = this.configService.get<string>('ADMIN_API_KEY');
    if (!adminKey || typeof providedKey !== 'string') {
      throw new UnauthorizedException('Admin API Key inválida');
    }

    const provided = Buffer.from(providedKey, 'utf-8');
    const expected = Buffer.from(adminKey, 'utf-8');

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Admin API Key inválida');
    }
  }
}
