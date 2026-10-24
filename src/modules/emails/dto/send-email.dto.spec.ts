import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SendEmailDto } from './send-email.dto';

describe('SendEmailDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: SendEmailDto };
  const base = { subject: 'Asunto', html: '<p>Hola</p>' };

  const validate = (body: Record<string, unknown>) =>
    pipe.transform(body, metadata) as Promise<SendEmailDto>;

  const rejectionOf = async (body: Record<string, unknown>) => {
    try {
      await validate(body);
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      return JSON.stringify((e as BadRequestException).getResponse());
    }
    throw new Error('Se esperaba que la validación fallara');
  };

  describe.each(['to', 'cc', 'bcc'] as const)('campo %s', (field) => {
    const withField = (value: string) => ({ to: 'principal@correo.com', ...base, [field]: value });

    it('acepta un email individual', async () => {
      const dto = await validate(withField('uno@correo.com'));
      expect(dto[field]).toEqual(['uno@correo.com']);
    });

    it('acepta un arreglo JSON de emails', async () => {
      const dto = await validate(withField('["uno@correo.com","dos@correo.com"]'));
      expect(dto[field]).toEqual(['uno@correo.com', 'dos@correo.com']);
    });

    it('acepta un arreglo JSON con un solo email', async () => {
      const dto = await validate(withField('["uno@correo.com"]'));
      expect(dto[field]).toEqual(['uno@correo.com']);
    });

    it('rechaza un email inválido dentro de la lista', async () => {
      const message = await rejectionOf(withField('["uno@correo.com","no-es-email"]'));
      expect(message).toContain('Email inválido en la lista: no-es-email');
    });

    it('rechaza un formato no reconocido', async () => {
      const message = await rejectionOf(withField('{"a":1}'));
      expect(message).toContain('Se espera un JSON array de emails o un email individual');
    });
  });

  it('exige el campo to', async () => {
    await rejectionOf({ ...base });
  });

  it('acepta la ausencia de cc y bcc', async () => {
    const dto = await validate({ to: 'uno@correo.com', ...base });
    expect(dto.cc).toBeUndefined();
    expect(dto.bcc).toBeUndefined();
  });
});
