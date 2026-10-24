import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  loadAttachments,
  normalizeAttachmentName,
  resolveContentType,
  resolveStoredAttachments,
} from './attachment.utils';

describe('normalizeAttachmentName', () => {
  it.each([
    ['oficio-123.pdf', 'oficio-123.pdf'],
    ['Constancia_Pérez_Muñoz.pdf', 'Constancia_Pérez_Muñoz.pdf'],
    ['C:\\docs\\reporte.xlsx', 'reporte.xlsx'],
    ['../reporte.xlsx', 'reporte.xlsx'],
    ['/etc/passwd', 'passwd'],
    ['nombre\u0000con\u001fcontrol.txt', 'nombreconcontrol.txt'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeAttachmentName(input)).toBe(expected);
  });

  it.each(['', '   ', '../', '..', undefined])('usa "adjunto" cuando el nombre queda vacío (%j)', (input) => {
    expect(normalizeAttachmentName(input)).toBe('adjunto');
  });
});

describe('resolveContentType', () => {
  it('usa la extensión conocida aunque el tipo declarado sea genérico', () => {
    expect(resolveContentType('reporte.xlsx', 'application/octet-stream')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('ignora mayúsculas en la extensión', () => {
    expect(resolveContentType('FOTO.JPG')).toBe('image/jpeg');
  });

  it('usa el tipo declarado si la extensión es desconocida', () => {
    expect(resolveContentType('datos.xml', 'application/xml')).toBe('application/xml');
  });

  it('usa application/octet-stream sin extensión conocida ni tipo declarado', () => {
    expect(resolveContentType('datos.xml')).toBe('application/octet-stream');
    expect(resolveContentType('sin-extension', '  ')).toBe('application/octet-stream');
  });
});

describe('resolveStoredAttachments', () => {
  it('toma nombre, tipo y ruta de los metadatos del EmailLog', () => {
    const metadata = [
      { name: 'Pérez.pdf', contentType: 'application/pdf', size: 10, path: 'uploads/123-abc.pdf' },
    ];
    expect(resolveStoredAttachments(metadata, ['uploads/123-abc.pdf'])).toEqual([
      { name: 'Pérez.pdf', contentType: 'application/pdf', path: 'uploads/123-abc.pdf' },
    ]);
  });

  it('usa las rutas del trabajo cuando no hay metadatos (trabajos antiguos)', () => {
    expect(resolveStoredAttachments(null, ['uploads/123-abc.pdf'])).toEqual([
      { name: '123-abc.pdf', path: 'uploads/123-abc.pdf' },
    ]);
  });

  it('devuelve una lista vacía sin metadatos ni rutas', () => {
    expect(resolveStoredAttachments(undefined, undefined)).toEqual([]);
  });
});

describe('loadAttachments', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'attachments-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('lee el archivo temporal y lo devuelve con su nombre original y tipo MIME', async () => {
    const tempPath = path.join(dir, '1716493200000-a1b2c3.pdf');
    await fs.writeFile(tempPath, 'contenido');

    const [attachment] = await loadAttachments([
      { name: 'Constancia_Pérez.pdf', contentType: 'application/octet-stream', path: tempPath },
    ]);

    expect(attachment).toEqual({
      name: 'Constancia_Pérez.pdf',
      contentType: 'application/pdf',
      contentBytes: Buffer.from('contenido').toString('base64'),
    });
  });
});
