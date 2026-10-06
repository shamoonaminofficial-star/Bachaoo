import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import {
  IStorageService,
  UploadParams,
  UploadResult,
} from './storage.interface';

/**
 * Development storage: writes to UPLOAD_DIR (default ./uploads) and serves
 * files at /uploads/<key>. In production the app should sit behind the
 * S3-compatible implementation; local disk does not scale across replicas.
 */
@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly dir =
    process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
  private readonly publicBase =
    process.env.UPLOAD_PUBLIC_BASE || '/uploads';

  async upload({ filename, folder, buffer }: UploadParams): Promise<UploadResult> {
    const key = `${folder}/${randomUUID()}${extname(filename).toLowerCase()}`;
    const dest = join(this.dir, key);
    await fs.mkdir(join(this.dir, folder), { recursive: true });
    await fs.writeFile(dest, buffer);
    this.logger.debug(`Stored upload at ${dest}`);
    return { url: `${this.publicBase}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(join(this.dir, key));
    } catch {
      // Already gone — deletion is idempotent.
    }
  }
}
