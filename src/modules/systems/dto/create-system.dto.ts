import { IsString, IsNotEmpty, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSystemDto {
  @ApiProperty({ description: 'Identificador único del sistema', example: 'control-gestion' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/)
  key: string;

  @ApiProperty({ description: 'Nombre del sistema', example: 'Control de Gestión' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;
}
