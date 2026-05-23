import * as fs from 'fs/promises';
import * as path from 'path';

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

export async function filesToBase64(
  filePaths: string[],
): Promise<Array<{ name: string; contentType: string; contentBytes: string }>> {
  const results: Array<{ name: string; contentType: string; contentBytes: string }> = [];

  for (const filePath of filePaths) {
    const buffer = await fs.readFile(filePath);
    const name = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const mimeMap: Record<string, string> = {
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

    const contentType = mimeMap[ext] || 'application/octet-stream';
    results.push({
      name,
      contentType,
      contentBytes: buffer.toString('base64'),
    });
  }

  return results;
}
