import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import type { Request } from 'express';
import { cleanupFiles } from '../../modules/queue/attachment.utils';

/**
 * Deletes the files uploaded by multer when the request fails afterwards
 * (validation pipe, service errors), so rejected requests leave nothing in UPLOAD_DIR.
 * Must be registered after the multer interceptor.
 */
@Injectable()
export class CleanupUploadsOnErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      catchError((error: unknown) =>
        from(cleanupFiles(uploadedPaths(request))).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }
}

function uploadedPaths(request: Request): string[] {
  const files = request.files;
  if (!files) return [];

  const list = Array.isArray(files) ? files : Object.values(files).flat();
  return list.map((file) => file.path).filter(Boolean);
}
