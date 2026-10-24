import { IsString, IsEmail, IsNotEmpty, IsOptional, MinLength, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';

function parseJsonEmails(value: string): string[] {
  if (!value) return [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Accept single email without array wrapping. JSON arrays are checked first because
  // the regex also matches a one-element array like ["user@correo.com"].
  if (!value.trim().startsWith('[') && emailRegex.test(value)) return [value];

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

  @ApiPropertyOptional({ description: 'Copia: email individual o JSON array', example: '["copia@correo.com"]' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value ? parseJsonEmails(value) : undefined))
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({ description: 'Copia oculta: email individual o JSON array', example: '["oculta@correo.com"]' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => (value ? parseJsonEmails(value) : undefined))
  @IsArray()
  @IsEmail({}, { each: true })
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
