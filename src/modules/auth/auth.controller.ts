import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('consent')
  @ApiOperation({ summary: 'Iniciar flujo de consentimiento OAuth2 para un buzón' })
  @ApiQuery({ name: 'mailboxId', description: 'ID del buzón a autorizar' })
  @ApiResponse({ status: 302, description: 'Redirige a Microsoft login para consentimiento' })
  @ApiResponse({ status: 400, description: 'Buzón no encontrado' })
  async consent(@Query('mailboxId') mailboxId: string, @Res() res: Response) {
    const consentUrl = await this.authService.getConsentUrl(mailboxId);
    res.redirect(consentUrl);
  }

  @Get('callback')
  @ApiOperation({ summary: 'Callback de OAuth2 - intercambia código por tokens' })
  @ApiResponse({ status: 200, description: 'Consentimiento completado correctamente' })
  @ApiResponse({ status: 400, description: 'Error en el consentimiento o buzón no encontrado' })
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
    } catch (err: any) {
      this.renderResult(res, 400, 'Error al procesar consentimiento', err.message);
    }
  }

  private renderResult(res: Response, statusCode: number, title: string, message: string) {
    res.status(statusCode).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px">
<h2>${title}</h2><p>${message}</p>
<p>Puedes cerrar esta ventana.</p>
</body></html>`);
  }
}
