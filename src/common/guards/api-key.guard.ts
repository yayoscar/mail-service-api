import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Reflector } from '@nestjs/core';
import { REQUIRE_API_KEY_KEY } from '../decorators/api-key.decorator';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireApiKey = this.reflector.getAllAndOverride<boolean>(REQUIRE_API_KEY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requireApiKey) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('Header x-api-key es requerido');
    }

    const systems = await this.prisma.system.findMany({
      where: { active: true },
      select: { id: true, apiKeyHash: true },
    });

    for (const system of systems) {
      const match = await bcrypt.compare(apiKey, system.apiKeyHash);
      if (match) {
        const fullSystem = await this.prisma.system.findUnique({
          where: { id: system.id },
        });
        request.system = fullSystem;
        return true;
      }
    }

    throw new UnauthorizedException('API Key inválida');
  }
}
