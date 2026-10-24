import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  HttpException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiSecurity } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequireAdmin } from '../../common/decorators/admin.decorator';
import { escapeHtml } from '../../common/utils/escape-html';
import type { Response } from 'express';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('mailboxes/:id/consent-link')
  @RequireAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiSecurity('x-admin-api-key')
  @ApiOperation({
    summary: 'Emitir un enlace de consentimiento OAuth2 para un buzón',
    description:
      'El enlace caduca en 24 horas, sirve una sola vez e invalida los enlaces pendientes anteriores del buzón. ' +
      'Debe abrirlo el propietario del buzón.',
  })
  @ApiResponse({ status: 201, description: 'Enlace emitido: { url, expiresAt }' })
  @ApiResponse({ status: 400, description: 'El buzón está inactivo' })
  @ApiResponse({ status: 404, description: 'Buzón no encontrado' })
  createConsentLink(@Param('id') id: string) {
    return this.authService.createConsentLink(id);
  }

  @Get('auth/consent')
  @ApiOperation({ summary: 'Iniciar el consentimiento OAuth2 con un enlace emitido por el administrador' })
  @ApiQuery({ name: 'token', description: 'Token del enlace de consentimiento' })
  @ApiResponse({ status: 302, description: 'Redirige a Microsoft login para consentimiento' })
  @ApiResponse({ status: 400, description: 'Enlace inválido, caducado o ya utilizado' })
  async consent(@Query('token') token: string | undefined, @Res() res: Response) {
    try {
      res.redirect(await this.authService.getConsentUrl(token));
    } catch (err) {
      this.renderResult(res, 400, 'Enlace no válido', userMessage(err));
    }
  }

  @Get('auth/callback')
  @ApiOperation({ summary: 'Callback de OAuth2 - intercambia código por tokens' })
  @ApiResponse({ status: 200, description: 'Consentimiento completado correctamente' })
  @ApiResponse({ status: 400, description: 'Error en el consentimiento, state inválido o cuenta incorrecta' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    if (error) {
      this.renderResult(res, 400, 'Error de consentimiento', errorDescription || error);
      return;
    }

    if (!code || !state) {
      this.renderResult(res, 400, 'Error', 'No se recibió código de autorización o state.');
      return;
    }

    try {
      const result = await this.authService.handleCallback(code, state);
      this.renderResult(res, 200, 'Consentimiento exitoso', result.message);
    } catch (err) {
      this.renderResult(res, 400, 'Error al procesar consentimiento', userMessage(err));
    }
  }

  private renderResult(res: Response, statusCode: number, title: string, message: string) {
    res.status(statusCode).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px">
<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>
<p>Puedes cerrar esta ventana.</p>
</body></html>`);
  }
}

function userMessage(err: unknown): string {
  // Only HttpException messages are meant for users; anything else may expose internals
  return err instanceof HttpException ? err.message : 'Error interno al procesar el consentimiento.';
}
