import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import { SystemsService } from './systems.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import { RequireAdmin } from '../../common/decorators/admin.decorator';

@ApiTags('Systems')
@ApiSecurity('x-admin-api-key')
@Controller('systems')
export class SystemsController {
  constructor(private readonly systemsService: SystemsService) {}

  @Post()
  @RequireAdmin()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo sistema consumidor' })
  @ApiResponse({ status: 201, description: 'Sistema creado. La API Key se muestra UNA VEZ.' })
  create(@Body() dto: CreateSystemDto) {
    return this.systemsService.create(dto);
  }

  @Get()
  @RequireAdmin()
  @ApiOperation({ summary: 'Listar todos los sistemas' })
  @ApiResponse({ status: 200, description: 'Lista de sistemas' })
  findAll() {
    return this.systemsService.findAll();
  }

  @Patch(':id')
  @RequireAdmin()
  @ApiOperation({ summary: 'Actualizar un sistema' })
  @ApiResponse({ status: 200, description: 'Sistema actualizado' })
  @ApiResponse({ status: 404, description: 'Sistema no encontrado' })
  update(@Param('id') id: string, @Body() dto: UpdateSystemDto) {
    return this.systemsService.update(id, dto);
  }

  @Post(':id/regenerate-api-key')
  @RequireAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerar API Key del sistema' })
  @ApiResponse({ status: 200, description: 'Nueva API Key generada' })
  @ApiResponse({ status: 404, description: 'Sistema no encontrado' })
  regenerateApiKey(@Param('id') id: string) {
    return this.systemsService.regenerateApiKey(id);
  }
}
