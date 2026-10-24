import { ValidationPipe } from '@nestjs/common';
import { MailboxesService } from './mailboxes.service';
import { QueryMailboxesDto } from './dto/query-mailboxes.dto';
import type { PrismaService } from '../../config/prisma.service';

describe('MailboxesService.update', () => {
  const authorized = {
    id: 'mb-1',
    systemId: 'sys-1',
    email: 'controlgestion@dgeti.gob.mx',
    displayName: 'Control de Gestión',
    consentGiven: true,
    tokenExpiresAt: new Date(),
  };

  let prisma: {
    mailbox: { findUnique: jest.Mock; update: jest.Mock };
    consentRequest: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: MailboxesService;

  beforeEach(() => {
    prisma = {
      mailbox: {
        findUnique: jest.fn(({ where }: { where: { id?: string } }) =>
          Promise.resolve(where.id === 'mb-1' ? authorized : null),
        ),
        update: jest.fn(({ data }: { data: object }) => Promise.resolve({ ...authorized, ...data })),
      },
      consentRequest: { deleteMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new MailboxesService(prisma as unknown as PrismaService);
  });

  it('revoca el consentimiento e invalida los enlaces pendientes al cambiar el email', async () => {
    await service.update('mb-1', { email: 'nuevo@dgeti.gob.mx' });

    expect(prisma.consentRequest.deleteMany).toHaveBeenCalledWith({
      where: { mailboxId: 'mb-1', usedAt: null },
    });
    expect(prisma.mailbox.update).toHaveBeenCalledWith({
      where: { id: 'mb-1' },
      data: {
        email: 'nuevo@dgeti.gob.mx',
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        consentGiven: false,
      },
    });
  });

  it('conserva el consentimiento al cambiar solo el nombre visible', async () => {
    await service.update('mb-1', { displayName: 'Oficialía' });

    expect(prisma.consentRequest.deleteMany).not.toHaveBeenCalled();
    expect(prisma.mailbox.update).toHaveBeenCalledWith({
      where: { id: 'mb-1' },
      data: { displayName: 'Oficialía' },
    });
  });

  it('rechaza desactivar el buzón por defecto por PATCH', async () => {
    prisma.mailbox.findUnique.mockResolvedValueOnce({ ...authorized, isDefault: true });

    await expect(service.update('mb-1', { active: false })).rejects.toThrow(
      'No se puede desactivar el buzón por defecto del sistema',
    );
    expect(prisma.mailbox.update).not.toHaveBeenCalled();
  });

  it('permite reactivar un buzón por PATCH', async () => {
    prisma.mailbox.findUnique.mockResolvedValueOnce({ ...authorized, isDefault: false, active: false });

    await service.update('mb-1', { active: true });
    expect(prisma.mailbox.update).toHaveBeenCalledWith({ where: { id: 'mb-1' }, data: { active: true } });
  });

  it('no considera cambio de cuenta una diferencia solo en mayúsculas', async () => {
    await service.update('mb-1', { email: 'ControlGestion@DGETI.gob.mx' });

    expect(prisma.mailbox.update).toHaveBeenCalledWith({
      where: { id: 'mb-1' },
      data: { email: 'ControlGestion@DGETI.gob.mx' },
    });
  });
});

describe('MailboxesService.findBySystem', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const service = new MailboxesService({ mailbox: { findMany } } as unknown as PrismaService);

  beforeEach(() => findMany.mockClear());

  it('lista solo los activos por defecto', async () => {
    await service.findBySystem('sys-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { systemId: 'sys-1', active: true } }),
    );
  });

  it('incluye los inactivos con includeInactive', async () => {
    await service.findBySystem('sys-1', true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { systemId: 'sys-1' } }));
  });
});

describe('QueryMailboxesDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parse = (query: Record<string, string>) =>
    pipe.transform(query, { type: 'query', metatype: QueryMailboxesDto }) as Promise<QueryMailboxesDto>;

  it.each([
    [{ includeInactive: 'true' }, true],
    [{ includeInactive: 'false' }, false],
    [{}, undefined],
  ])('%j → %s', async (query, expected) => {
    expect((await parse(query)).includeInactive).toBe(expected);
  });
});
