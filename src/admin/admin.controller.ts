import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminActivityQueryDto, AdminFilesQueryDto, AdminRangeQueryDto, AdminRoleDto, AdminStatusDto, AdminUsersQueryDto, UpdateAdminPlatformSettingsDto } from './dto/admin-query.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview') overview(@Query() query: AdminRangeQueryDto) { return this.admin.getOverview(query.range); }
  @Get('users') users(@Query() query: AdminUsersQueryDto) { return this.admin.listUsers(query); }
  @Get('users/:id') user(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.admin.getUser(id); }
  @Patch('users/:id/status') status(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: AdminStatusDto) { return this.admin.updateUserStatus(actor.sub, id, dto.status); }
  @Patch('users/:id/role') role(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: AdminRoleDto) { return this.admin.updateUserRole(actor.sub, id, dto.role); }
  @Get('usage') usage(@Query() query: AdminRangeQueryDto) { return this.admin.getUsage(query.range); }
  @Get('integrations') integrations() { return this.admin.getIntegrations(); }
  @Get('notifications') notifications(@Query() query: AdminRangeQueryDto) { return this.admin.getNotifications(query.range); }
  @Patch('notifications/:id/retry') retryNotification(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) { return this.admin.retryNotification(actor.sub, id); }
  @Get('files') files(@Query() query: AdminFilesQueryDto) { return this.admin.getFiles(query); }
  @Get('activity') activity(@Query() query: AdminActivityQueryDto) { return this.admin.getActivity(query); }
  @Get('system') system() { return this.admin.getSystemHealth(); }
  @Get('settings') settings() { return this.admin.getSettings(); }
  @Patch('settings/platform') platformSettings(@CurrentUser() actor: AuthenticatedUser, @Body() dto: UpdateAdminPlatformSettingsDto) { return this.admin.updatePlatformSettings(actor.sub, dto); }
}
