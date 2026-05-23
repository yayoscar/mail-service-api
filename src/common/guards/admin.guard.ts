import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { REQUIRE_ADMIN_KEY } from '../decorators/admin.decorator';
import * as crypto from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requireAdmin = this.reflector.getAllAndOverride<boolean>(REQUIRE_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireAdmin) return true;

    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-admin-api-key'];
    const adminKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!providedKey || !adminKey) {
      throw new UnauthorizedException('Header x-admin-api-key es requerido');
    }

    const provided = Buffer.from(providedKey, 'utf-8');
    const expected = Buffer.from(adminKey, 'utf-8');

    if (provided.length !== expected.length) {
      throw new UnauthorizedException('Admin API Key inválida');
    }

    if (!crypto.timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Admin API Key inválida');
    }

    return true;
  }
}
