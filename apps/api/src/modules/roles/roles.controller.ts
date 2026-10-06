import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SyncPermissionsDto } from './dto/sync-permissions.dto';

/**
 * Platform role & permission administration.
 * Requires the 'admin.manage' permission (seeded on ADMIN / SUPER_ADMIN).
 */
@ApiTags('roles')
@ApiBearerAuth()
@Permissions('admin.manage')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  listRoles() {
    return this.rolesService.listRoles();
  }

  @Get('permissions')
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Get(':id')
  getRole(@Param('id') id: string) {
    return this.rolesService.getRole(id);
  }

  @Post()
  @Audit('role.create')
  createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Patch(':id')
  @Audit('role.update')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete(':id')
  @Audit('role.delete')
  deleteRole(@Param('id') id: string) {
    return this.rolesService.deleteRole(id);
  }

  @Post(':id/permissions')
  @Audit('role.permissions.sync')
  syncPermissions(@Param('id') id: string, @Body() dto: SyncPermissionsDto) {
    return this.rolesService.syncPermissions(id, dto);
  }
}
