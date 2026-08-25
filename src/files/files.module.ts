import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlaceholderFileContentExtractor } from './extractors/placeholder-file-content.extractor';
import { TextFileContentExtractor } from './extractors/text-file-content.extractor';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FILE_STORAGE_ADAPTER } from './storage/file-storage-adapter';
import { LocalFileStorageAdapter } from './storage/local-file-storage.adapter';
import { S3FileStorageAdapter } from './storage/s3-file-storage.adapter';

@Module({
  imports: [ConfigModule, PrismaModule, CommonModule, ActivityLogModule],
  controllers: [FilesController],
  providers: [
    LocalFileStorageAdapter, S3FileStorageAdapter, TextFileContentExtractor, PlaceholderFileContentExtractor,
    {
      provide: FILE_STORAGE_ADAPTER,
      inject: [ConfigService, LocalFileStorageAdapter, S3FileStorageAdapter],
      useFactory: (config: ConfigService, local: LocalFileStorageAdapter, s3: S3FileStorageAdapter) => config.get('storage.provider') === 'S3' ? s3 : local,
    },
    FilesService,
  ],
  exports: [FilesService, TextFileContentExtractor, PlaceholderFileContentExtractor],
})
export class FilesModule {}
