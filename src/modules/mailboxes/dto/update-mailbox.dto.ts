import { IsString, IsEmail, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMailboxDto {
  @ApiPropertyOptional({ description: 'Email del buzón' })
  @IsString()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Nombre visible del buzón' })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Estado activo del buzón' })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
