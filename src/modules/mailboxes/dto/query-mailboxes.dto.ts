import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryMailboxesDto {
  @ApiPropertyOptional({ description: 'Incluir también los buzones inactivos', default: false })
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  includeInactive?: boolean;
}
