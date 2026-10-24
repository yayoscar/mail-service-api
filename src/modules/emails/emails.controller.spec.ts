import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { MailboxesService } from '../mailboxes/mailboxes.service';
import { PrismaService } from '../../config/prisma.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { multerConfig } from '../../config/multer.config';

describe('POST /emails/send (adjuntos)', () => {
  let app: INestApplication;
  let uploadDir: string;
  const mailboxes = { findBySystemAndEmail: jest.fn(), findDefaultBySystemId: jest.fn() };
  const prisma = { emailLog: { create: jest.fn(), update: jest.fn() } };
  const queue = { add: jest.fn() };

  const uploadedFiles = () => fs.readdir(uploadDir);
  const mailbox = { id: 'mb-1', email: 'buzon@dgeti.gob.mx' };

  beforeAll(async () => {
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-'));
    process.env.UPLOAD_DIR = uploadDir;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), multerConfig],
      controllers: [EmailsController],
      providers: [
        EmailsService,
        { provide: MailboxesService, useValue: mailboxes },
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken('email-send'), useValue: queue },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ system: unknown }>().system = { id: 'sys-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(uploadDir, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.emailLog.create.mockResolvedValue({ id: 'log-1' });
    for (const file of await uploadedFiles()) await fs.rm(path.join(uploadDir, file));
  });

  const send = () =>
    request(app.getHttpServer())
      .post('/emails/send')
      .field('to', 'destino@correo.com')
      .field('subject', 'Asunto')
      .field('html', '<p>Hola</p>');

  it('borra los adjuntos si el remitente no pertenece al sistema (403)', async () => {
    mailboxes.findBySystemAndEmail.mockResolvedValue(null);

    await send()
      .field('from', 'ajeno@dgeti.gob.mx')
      .attach('attachments', Buffer.from('uno'), 'uno.pdf')
      .attach('attachments', Buffer.from('dos'), 'dos.pdf')
      .expect(403);

    expect(await uploadedFiles()).toEqual([]);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('borra los adjuntos si falla la validación (400)', async () => {
    await request(app.getHttpServer())
      .post('/emails/send')
      .field('to', 'destino@correo.com')
      .field('html', '<p>Sin asunto</p>')
      .attach('attachments', Buffer.from('uno'), 'uno.pdf')
      .expect(400);

    expect(await uploadedFiles()).toEqual([]);
  });

  it('borra los adjuntos si no hay buzón por defecto (400)', async () => {
    mailboxes.findDefaultBySystemId.mockResolvedValue(null);

    await send().attach('attachments', Buffer.from('uno'), 'uno.pdf').expect(400);

    expect(await uploadedFiles()).toEqual([]);
  });

  it('marca el log como FAILED y borra los adjuntos si falla el encolado', async () => {
    mailboxes.findDefaultBySystemId.mockResolvedValue(mailbox);
    queue.add.mockRejectedValue(new Error('Redis no disponible'));

    await send().attach('attachments', Buffer.from('uno'), 'uno.pdf').expect(500);

    expect(prisma.emailLog.update).toHaveBeenCalledWith({
      where: { id: 'log-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(await uploadedFiles()).toEqual([]);
  });

  it('conserva el adjunto de una solicitud aceptada y guarda su nombre original en UTF-8', async () => {
    mailboxes.findDefaultBySystemId.mockResolvedValue(mailbox);

    await send()
      .attach('attachments', Buffer.from('uno'), 'Constancia_Pérez_Muñoz.pdf')
      .expect(200);

    const files = await uploadedFiles();
    expect(files).toHaveLength(1);
    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attachments: [
          expect.objectContaining({
            name: 'Constancia_Pérez_Muñoz.pdf',
            path: path.join(uploadDir, files[0]),
          }),
        ],
      }),
    });
    expect(queue.add).toHaveBeenCalledWith('email-send', {
      emailLogId: 'log-1',
      attachmentPaths: [path.join(uploadDir, files[0])],
    });
  });
});
