import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const multerConfig = MulterModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => {
    const uploadDir = configService.get<string>('UPLOAD_DIR', './uploads');
    const maxAttachmentSize = configService.get<number>('MAX_ATTACHMENT_SIZE', 26214400);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const multer = require('multer');
    const storage = multer.diskStorage({
      destination: (_req: any, _file: any, cb: (err: Error | null, dest: string) => void) => {
        cb(null, uploadDir);
      },
      filename: (_req: any, file: { originalname: string }, cb: (err: Error | null, name: string) => void) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
      },
    });

    return {
      storage,
      limits: {
        fileSize: maxAttachmentSize,
      },
    };
  },
  inject: [ConfigService],
});
