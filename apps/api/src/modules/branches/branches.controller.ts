import { Controller, Delete, Get, Param, Patch, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { NearbyQueryDto, UpdateBranchDto } from './dto/branch.dto';

@ApiTags('branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Public()
  @Get('nearby')
  nearby(@Query() query: NearbyQueryDto) {
    return this.branches.nearby(query);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Get()
  adminList(
    @Query('businessId') businessId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.branches.adminList({ businessId, q, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Public()
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.branches.getById(id);
  }

  @ApiBearerAuth()
  @Roles(ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER, ...ADMIN_ROLES)
  @Audit('branch.update')
  @Patch(':id')
  update(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(id, dto, { id: user.id, roles: user.roles });
  }

  @ApiBearerAuth()
  @Roles(ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER, ...ADMIN_ROLES)
  @Audit('branch.delete')
  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.branches.remove(id, { id: user.id, roles: user.roles });
  }
}
