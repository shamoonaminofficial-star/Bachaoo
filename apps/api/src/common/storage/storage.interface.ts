/**
 * Storage abstraction for uploaded files (category icons, business logos,
 * application documents, deal images...).
 *
 * Env-driven selection (see StorageModule):
 * - S3_ENDPOINT set    -> S3-compatible object storage (MinIO locally, S3/R2 in prod)
 * - otherwise          -> local disk under UPLOAD_DIR (dev only)
 *
 * Callers work against IStorageService and never touch the filesystem or S3
 * directly. Returned URLs are public-read URLs the frontend can render.
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface UploadParams {
  /** Original filename, used only for the extension. */
  filename: string;
  /** MIME type, already validated by the caller. */
  mimetype: string;
  /** File bytes. */
  buffer: Buffer;
  /** Logical folder, e.g. 'categories', 'applications', 'businesses'. */
  folder: string;
}

export interface UploadResult {
  /** Public URL for the file. */
  url: string;
  /** Storage key (for deletion). */
  key: string;
}

export interface IStorageService {
  upload(params: UploadParams): Promise<UploadResult>;
  delete(key: string): Promise<void>;
}
