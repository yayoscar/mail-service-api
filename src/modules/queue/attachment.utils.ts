import * as fs from 'fs/promises';
import * as path from 'path';

export interface StoredAttachment {
  name: string;
  contentType?: string;
  path: string;
}

export interface GraphAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
};

const FALLBACK_NAME = 'adjunto';

export async function cleanupFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.error(`Error eliminando archivo ${filePath}:`, err.message);
      }
    }
  }
}

export function normalizeAttachmentName(name: string | undefined): string {
  // Keep only the last path segment, whether the client used "/" or "\" as separator
  const lastSegment = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- stripping control characters is the intent
  const cleaned = lastSegment.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  if (!cleaned || cleaned === '.' || cleaned === '..') return FALLBACK_NAME;
  return cleaned;
}

export function resolveContentType(name: string, declared?: string): string {
  const ext = path.extname(name).toLowerCase();
  return MIME_BY_EXTENSION[ext] || declared?.trim() || 'application/octet-stream';
}

export function resolveStoredAttachments(
  metadata: unknown,
  legacyPaths: string[] | undefined,
): StoredAttachment[] {
  if (Array.isArray(metadata) && metadata.length > 0) {
    return metadata.map((att: Partial<StoredAttachment>) => ({
      name: normalizeAttachmentName(att.name),
      contentType: att.contentType,
      path: att.path as string,
    }));
  }

  // Jobs queued before attachment metadata was used only carry the temporary paths
  return (legacyPaths ?? []).map((filePath) => ({
    name: path.basename(filePath),
    path: filePath,
  }));
}

export async function loadAttachments(attachments: StoredAttachment[]): Promise<GraphAttachment[]> {
  const results: GraphAttachment[] = [];

  for (const attachment of attachments) {
    const buffer = await fs.readFile(attachment.path);
    results.push({
      name: attachment.name,
      contentType: resolveContentType(attachment.name, attachment.contentType),
      contentBytes: buffer.toString('base64'),
    });
  }

  return results;
}
