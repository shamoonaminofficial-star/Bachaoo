import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import {
  IStorageService,
  UploadParams,
  UploadResult,
} from './storage.interface';

/**
 * S3-compatible object storage (AWS S3, MinIO, Cloudflare R2...).
 *
 * READY-STUB: the interface and env wiring are final; the actual SDK calls
 * are marked TODO below. To go live:
 *   1. `pnpm add @aws-sdk/client-s3`
 *   2. Implement upload()/delete() with PutObjectCommand / DeleteObjectCommand
 *      against S3_ENDPOINT (path-style for MinIO), S3_BUCKET, S3_REGION.
 *   3. Serve via the bucket's public URL or CloudFront; store that base in
 *      S3_PUBLIC_BASE.
 *
 * Until then this service throws a clear 503 instead of silently misbehaving.
 */
@Injectable()
export class S3StorageService implements IStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly enabled = Boolean(process.env.S3_ACCESS_KEY);

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_NOT_CONFIGURED',
        message:
          'S3 storage is selected but S3_ACCESS_KEY is not set. ' +
          'Set the S3_* env vars or unset S3_ENDPOINT to use local storage.',
      });
    }
  }

  async upload({ filename, folder }: UploadParams): Promise<UploadResult> {
    this.assertEnabled();
    // TODO: PutObjectCommand -> S3_BUCKET / `${folder}/${randomUUID()}${ext}`
    const key = `${folder}/${randomUUID()}${extname(filename).toLowerCase()}`;
    this.logger.warn(`S3 upload stub hit for key ${key} — SDK not wired yet`);
    throw new ServiceUnavailableException({
      code: 'STORAGE_NOT_IMPLEMENTED',
      message: 'S3 upload is not wired yet (see S3StorageService TODO).',
    });
  }

  async delete(_key: string): Promise<void> {
    this.assertEnabled();
    // TODO: DeleteObjectCommand
    throw new ServiceUnavailableException({
      code: 'STORAGE_NOT_IMPLEMENTED',
      message: 'S3 delete is not wired yet (see S3StorageService TODO).',
    });
  }
}
