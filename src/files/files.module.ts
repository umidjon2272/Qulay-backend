import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlaceholderFileContentExtractor } from './extractors/placeholder-file-content.extractor';
import { TextFileContentExtractor } from './extractors/text-file-content.extractor';
import { PdfOfficeContentExtractor } from './extractors/pdf-office-content.extractor';
import { FileContentExtractionService } from './extractors/file-content-extraction.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FILE_STORAGE_ADAPTER } from './storage/file-storage-adapter';
import { LocalFileStorageAdapter } from './storage/local-file-storage.adapter';
import { S3FileStorageAdapter } from './storage/s3-file-storage.adapter';

@Module({
  imports: [ConfigModule, PrismaModule, CommonModule, ActivityLogModule, SubscriptionsModule],
  controllers: [FilesController],
  providers: [
    LocalFileStorageAdapter, S3FileStorageAdapter, TextFileContentExtractor, PdfOfficeContentExtractor, FileContentExtractionService, PlaceholderFileContentExtractor,
    {
      provide: FILE_STORAGE_ADAPTER,
      inject: [ConfigService, LocalFileStorageAdapter, S3FileStorageAdapter],
      useFactory: (config: ConfigService, local: LocalFileStorageAdapter, s3: S3FileStorageAdapter) => config.get('storage.provider') === 'S3' ? s3 : local,
    },
    FilesService,
  ],
  exports: [FilesService, FileContentExtractionService],
})
export class FilesModule {}
