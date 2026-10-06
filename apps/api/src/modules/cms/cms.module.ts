import { Module } from '@nestjs/common';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { StorageModule } from '../../common/storage/storage.module';

/**
 * Phase 11 — CMS. Imports StorageModule for banner image uploads.
 */
@Module({
  imports: [StorageModule],
  controllers: [CmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
