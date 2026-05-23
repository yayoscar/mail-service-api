import { PartialType } from '@nestjs/swagger';
import { CreateSystemDto } from './create-system.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSystemDto extends PartialType(CreateSystemDto) {
  @ApiPropertyOptional({ description: 'Estado activo del sistema' })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
