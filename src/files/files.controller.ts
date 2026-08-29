import { Response } from 'express';
import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { FileQueryDto } from './dto/file-query.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, @Body() dto: UploadFileDto) {
    return this.files.uploadForUser(user.sub, file, dto.folderId, dto.label ?? dto.title);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: FileQueryDto) { return this.files.listForUser(user.sub, query); }

  @Get('folders')
  listFolders(@CurrentUser() user: AuthenticatedUser) { return this.files.listFoldersForUser(user.sub); }

  @Post('folders')
  createFolder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFolderDto) { return this.files.createFolderForUser(user.sub, dto); }

  @Patch('folders/:id')
  updateFolder(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateFolderDto) { return this.files.updateFolderForUser(user.sub, id, dto); }

  @Delete('folders/:id')
  deleteFolder(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.files.deleteFolderForUser(user.sub, id); }

  @Get(':id/download')
  async download(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.files.getDownloadForUser(user.sub, id);
    response.setHeader('Content-Disposition', contentDisposition(file.originalName));
    return new StreamableFile(file.stream, { type: file.mimeType, length: file.sizeBytes });
  }

  @Get(':id/content')
  content(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.files.getContentForUser(user.sub, id); }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.files.getForUser(user.sub, id); }

  @Delete(':id')
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.files.deleteForUser(user.sub, id); }
}

function contentDisposition(originalName: string): string {
  const fallback = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}
