import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  AdminSessionService,
} from './admin-session.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Admin session')
@Controller('admin-session')
export class AdminSessionController {
  constructor(private sessionService: AdminSessionService) {}

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión como administrador web' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada; establece la cookie de sesión' })
  @ApiResponse({ status: 401, description: 'Usuario o contraseña incorrectos' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos; espere un minuto' })
  @ApiResponse({ status: 503, description: 'Administración web no configurada' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.sessionService.login(dto.username, dto.password, req.ip);
    res.cookie(ADMIN_SESSION_COOKIE, token, {
      ...cookieOptions(req),
      maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
    });
    return { username: dto.username };
  }

  @Get('me')
  @ApiOperation({ summary: 'Consultar la sesión de administrador actual' })
  @ApiResponse({ status: 200, description: 'Sesión válida: { username }' })
  @ApiResponse({ status: 401, description: 'Sin sesión válida' })
  async me(@Req() req: Request) {
    const username = await this.sessionService.verify(sessionCookie(req));
    if (!username) {
      throw new UnauthorizedException('Sesión no válida o caducada');
    }
    return { username };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar la sesión de administrador' })
  @ApiResponse({ status: 200, description: 'Cookie de sesión eliminada' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions(req));
    return { message: 'Sesión cerrada' };
  }
}

export function sessionCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[ADMIN_SESSION_COOKIE];
}

function cookieOptions(req: Request): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', path: '/', secure: req.secure };
}
