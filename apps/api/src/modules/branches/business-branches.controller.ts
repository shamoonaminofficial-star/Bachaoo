import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES, ROLES } from '../../common/constants';
import { CreateBranchDto } from './dto/branch.dto';

/**
 * Branch collection scoped under a business: /businesses/:businessId/branches.
 * Public callers see active branches; owners/admins may pass ?includeInactive=true.
 */
@ApiTags('business-branches')
@Controller('businesses/:businessId/branches')
export class BusinessBranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Public()
  @Get()
  list(
    @Param('businessId') businessId: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.branches.listByBusiness(
      businessId,
      user ? { id: user.id, roles: user.roles } : undefined,
      includeInactive === 'true',
    );
  }

  @ApiBearerAuth()
  @Roles(ROLES.BUSINESS_OWNER, ROLES.BUSINESS_MANAGER, ...ADMIN_ROLES)
  @Audit('branch.create')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: JwtUser,
    @Param('businessId') businessId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branches.create(businessId, dto, { id: user.id, roles: user.roles });
  }
}
