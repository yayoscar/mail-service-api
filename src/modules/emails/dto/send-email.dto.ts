import { IsString, IsEmail, IsNotEmpty, IsOptional, MinLength, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';

function parseJsonEmails(value: string): string[] {
  if (!value) return [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Accept single email without array wrapping
  if (emailRegex.test(value)) return [value];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new BadRequestException('Se espera un JSON array de emails o un email individual');
    parsed.forEach((email: string) => {
      if (!emailRegex.test(email)) throw new BadRequestException(`Email inválido en la lista: ${email}`);
    });
    return parsed;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('Se espera un JSON array de emails o un email individual, ej: ["user@correo.com"] o user@correo.com');
  }
}

export class SendEmailDto {
  @ApiPropertyOptional({ description: 'Email del remitente (buzón autorizado). Si no se envía, usa el buzón default.' })
  @IsString()
  @IsOptional()
  @IsEmail()
  from?: string;

  @ApiProperty({ description: 'Destinatario(s): email individual o JSON array', example: '["usuario@correo.com"]' })
  @Transform(({ value }: { value: string }) => parseJsonEmails(value))
  @IsArray()
  @IsEmail({}, { each: true })
  to: string[];

  @ApiPropertyOptional({ description: 'JSON array de copia', example: '["copia@correo.com"]' })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value ? parseJsonEmails(value) : undefined))
  cc?: string[];

  @ApiPropertyOptional({ description: 'JSON array de copia oculta', example: '["oculta@correo.com"]' })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value ? parseJsonEmails(value) : undefined))
  bcc?: string[];

  @ApiProperty({ description: 'Asunto del correo' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  subject: string;

  @ApiProperty({ description: 'Cuerpo HTML del correo' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  html: string;
}

export class SendEmailResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  emailLogId: string;

  @ApiProperty()
  status: string;
}
