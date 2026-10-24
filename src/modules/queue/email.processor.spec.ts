import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { Job } from 'bullmq';
import { EmailProcessor } from './email.processor';
import type { PrismaService } from '../../config/prisma.service';
import type { GraphMailService } from '../graph/graph-mail.service';

describe('EmailProcessor', () => {
  let dir: string;
  let tempPath: string;
  let prisma: { emailLog: { findUnique: jest.Mock; update: jest.Mock } };
  let graph: { sendMail: jest.Mock };
  let processor: EmailProcessor;

  const emailLog = (attachments: unknown) => ({
    id: 'log-1',
    from: 'buzon@dgeti.gob.mx',
    mailboxId: 'mb-1',
    subject: 'Asunto',
    htmlBody: '<p>Hola</p>',
    to: ['destino@correo.com'],
    cc: null,
    bcc: null,
    attachments,
    attempts: 0,
  });

  const job = (attachmentPaths: string[]) =>
    ({ data: { emailLogId: 'log-1', attachmentPaths }, attemptsMade: 0 }) as unknown as Job<{
      emailLogId: string;
      attachmentPaths: string[];
    }>;

  const fileExists = (p: string) =>
    fs.access(p).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'processor-'));
    tempPath = path.join(dir, '1716493200000-a1b2c3.xlsx');
    await fs.writeFile(tempPath, 'datos');

    prisma = { emailLog: { findUnique: jest.fn(), update: jest.fn() } };
    graph = { sendMail: jest.fn().mockResolvedValue('SENT') };
    processor = new EmailProcessor(
      prisma as unknown as PrismaService,
      graph as unknown as GraphMailService,
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('envía los adjuntos con su nombre original y tipo MIME, y borra el temporal', async () => {
    prisma.emailLog.findUnique.mockResolvedValue(
      emailLog([
        { name: 'Reporte_Año_Fiscal.xlsx', contentType: 'application/octet-stream', size: 5, path: tempPath },
      ]),
    );

    await processor.process(job([tempPath]));

    expect(graph.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            name: 'Reporte_Año_Fiscal.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBytes: Buffer.from('datos').toString('base64'),
          },
        ],
      }),
    );
    expect(prisma.emailLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
    expect(await fileExists(tempPath)).toBe(false);
  });

  it('procesa trabajos antiguos sin metadatos usando las rutas del trabajo', async () => {
    prisma.emailLog.findUnique.mockResolvedValue(emailLog(null));

    await processor.process(job([tempPath]));

    expect(graph.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ name: '1716493200000-a1b2c3.xlsx' })],
      }),
    );
    expect(await fileExists(tempPath)).toBe(false);
  });

  it('borra los adjuntos al fallar definitivamente', async () => {
    prisma.emailLog.findUnique.mockResolvedValue(
      emailLog([{ name: 'reporte.xlsx', contentType: '', size: 5, path: tempPath }]),
    );
    graph.sendMail.mockRejectedValue(Object.assign(new Error('Bad Request'), { status: 400 }));

    await processor.process(job([tempPath]));

    expect(prisma.emailLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(await fileExists(tempPath)).toBe(false);
  });

  it('conserva los adjuntos cuando el error es transitorio y se reintentará', async () => {
    prisma.emailLog.findUnique.mockResolvedValue(
      emailLog([{ name: 'reporte.xlsx', contentType: '', size: 5, path: tempPath }]),
    );
    graph.sendMail.mockRejectedValue(Object.assign(new Error('Throttled'), { status: 429 }));

    await expect(processor.process(job([tempPath]))).rejects.toThrow('Throttled');
    expect(await fileExists(tempPath)).toBe(true);
  });
});
