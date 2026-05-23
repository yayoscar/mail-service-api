import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { MailboxesService } from './mailboxes.service';
import { CreateMailboxDto } from './dto/create-mailbox.dto';
import { UpdateMailboxDto } from './dto/update-mailbox.dto';
import { RequireAdmin } from '../../common/decorators/admin.decorator';

@ApiTags('Mailboxes')
@ApiSecurity('x-admin-api-key')
@Controller()
export class MailboxesController {
  constructor(private readonly mailboxesService: MailboxesService) {}

  @Post('systems/:systemId/mailboxes')
  @RequireAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar buzón a un sistema' })
  @ApiResponse({ status: 201, description: 'Buzón creado' })
  @ApiResponse({ status: 404, description: 'Sistema no encontrado' })
  @ApiResponse({ status: 409, description: 'Email de buzón ya existe' })
  create(@Param('systemId') systemId: string, @Body() dto: CreateMailboxDto) {
    return this.mailboxesService.create(systemId, dto);
  }

  @Get('systems/:systemId/mailboxes')
  @RequireAdmin()
  @ApiOperation({ summary: 'Listar buzones de un sistema' })
  @ApiResponse({ status: 200, description: 'Lista de buzones activos' })
  findBySystem(@Param('systemId') systemId: string) {
    return this.mailboxesService.findBySystem(systemId);
  }

  @Patch('mailboxes/:id')
  @RequireAdmin()
  @ApiOperation({ summary: 'Actualizar buzón' })
  @ApiResponse({ status: 200, description: 'Buzón actualizado' })
  @ApiResponse({ status: 404, description: 'Buzón no encontrado' })
  update(@Param('id') id: string, @Body() dto: UpdateMailboxDto) {
    return this.mailboxesService.update(id, dto);
  }

  @Delete('mailboxes/:id')
  @RequireAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar buzón (soft delete)' })
  @ApiResponse({ status: 200, description: 'Buzón desactivado' })
  @ApiResponse({ status: 400, description: 'No se puede desactivar el buzón por defecto' })
  deactivate(@Param('id') id: string) {
    return this.mailboxesService.deactivate(id);
  }

  @Patch('mailboxes/:id/default')
  @RequireAdmin()
  @ApiOperation({ summary: 'Marcar buzón como default' })
  @ApiResponse({ status: 200, description: 'Buzón marcado como default' })
  setDefault(@Param('id') id: string) {
    return this.mailboxesService.setDefault(id);
  }
}
