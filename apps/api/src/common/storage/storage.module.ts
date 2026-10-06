import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

/**
 * Provides STORAGE_SERVICE (IStorageService) app-wide.
 * Selection: S3_ENDPOINT set -> S3-compatible, otherwise local disk.
 */
@Global()
@Module({
  providers: [
    LocalStorageService,
    S3StorageService,
    {
      provide: STORAGE_SERVICE,
      useFactory: (local: LocalStorageService, s3: S3StorageService) =>
        process.env.S3_ENDPOINT ? s3 : local,
      inject: [LocalStorageService, S3StorageService],
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
