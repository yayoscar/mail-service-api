import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryEmailLogDto } from './dto/query-email-log.dto';
import { RequireAdmin } from '../../common/decorators/admin.decorator';

@ApiTags('Audit')
@ApiSecurity('x-admin-api-key')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('email-logs')
  @RequireAdmin()
  @ApiOperation({ summary: 'Listar logs de correo (paginado)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de logs' })
  findAll(@Query() query: QueryEmailLogDto) {
    return this.auditService.findAll(query);
  }

  @Get('email-logs/:id')
  @RequireAdmin()
  @ApiOperation({ summary: 'Obtener detalle de un log de correo' })
  @ApiResponse({ status: 200, description: 'Detalle del log' })
  @ApiResponse({ status: 404, description: 'Log no encontrado' })
  findOne(@Param('id') id: string) {
    return this.auditService.findOne(id);
  }
}
