import { IsString, IsEmail, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMailboxDto {
  @ApiProperty({ description: 'Email del buzón', example: 'controlgestion@dgeti.gob.mx' })
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Nombre visible del buzón', example: 'Control de Gestión' })
  @IsString()
  @IsNotEmpty()
  displayName: string;

  @ApiPropertyOptional({ description: 'Marcar como buzón por defecto', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
