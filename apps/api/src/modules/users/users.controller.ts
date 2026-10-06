import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SuspendDto } from './dto/suspend.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';

/**
 * Admin user management. All routes require explicit permissions
 * (see seed: user.read, user.update, user.suspend, admin.manage).
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Permissions('user.read')
  @Get()
  listUsers(@Query() query: UserQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Permissions('user.read')
  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }

  @Permissions('user.update')
  @Patch(':id')
  @Audit('user.update')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Permissions('user.suspend')
  @Post(':id/suspend')
  @Audit('user.suspend')
  suspendUser(@Param('id') id: string, @Body() dto: SuspendDto) {
    return this.usersService.suspendUser(id, dto.reason);
  }

  @Permissions('user.suspend')
  @Post(':id/reactivate')
  @Audit('user.reactivate')
  reactivateUser(@Param('id') id: string) {
    return this.usersService.reactivateUser(id);
  }

  /**
   * Replaces the user's role set. Deliberately separate from PATCH so role
   * escalation can never slip through a profile update.
   */
  @Permissions('admin.manage')
  @Post(':id/roles')
  @Audit('user.roles.assign')
  assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.assignRoles(id, dto, actorId);
  }
}
