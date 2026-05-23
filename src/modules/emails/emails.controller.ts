import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { EmailsService } from './emails.service';
import { SendEmailDto } from './dto/send-email.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { RequireApiKey } from '../../common/decorators/api-key.decorator';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@ApiTags('Emails')
@ApiSecurity('x-api-key')
@Controller('emails')
@UseGuards(ApiKeyGuard)
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private configService: ConfigService,
  ) {}

  @Post('send')
  @RequireApiKey()
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      limits: {
        fileSize: 26214400,
      },
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Encolar envío de correo con adjuntos' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Email del remitente (opcional)' },
        to: { type: 'string', description: 'JSON array de destinatarios', example: '["user@correo.com"]' },
        cc: { type: 'string', description: 'JSON array de copia' },
        bcc: { type: 'string', description: 'JSON array de copia oculta' },
        subject: { type: 'string', description: 'Asunto del correo' },
        html: { type: 'string', description: 'Cuerpo HTML del correo' },
        attachments: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['to', 'subject', 'html'],
    },
  })
  @ApiResponse({ status: 200, description: 'Correo encolado correctamente' })
  @ApiResponse({ status: 401, description: 'API Key inválida' })
  @ApiResponse({ status: 403, description: 'Buzón no autorizado' })
  send(
    @Body() dto: SendEmailDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    return this.emailsService.send((req as any).system.id, dto, files);
  }
}
