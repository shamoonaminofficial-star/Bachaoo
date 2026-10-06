import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { ADMIN_ROLES } from '../../common/constants';
import {
  CreateAreaDto,
  CreateCityDto,
  CreateCountryDto,
  CreateProvinceDto,
  ToggleActiveDto,
  UpdateAreaDto,
  UpdateCityDto,
  UpdateCountryDto,
} from './dto/location.dto';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  // ------------------------------------------------------------- public read

  @Public()
  @Get('countries')
  getCountries() {
    return this.locations.getCountries();
  }

  @Public()
  @Get('countries/:code/provinces')
  getProvinces(@Param('code') code: string) {
    return this.locations.getProvinces(code);
  }

  @Public()
  @Get('provinces/:id/cities')
  getCities(@Param('id') id: string) {
    return this.locations.getCities(id);
  }

  @Public()
  @Get('cities')
  searchCities(@Query('search') search?: string) {
    return this.locations.searchCities(search);
  }

  @Public()
  @Get('cities/:id/areas')
  getAreas(@Param('id') id: string) {
    return this.locations.getAreas(id);
  }

  // ------------------------------------------------------------------- admin

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.createCountry')
  @Post('countries')
  @HttpCode(HttpStatus.CREATED)
  createCountry(@Body() dto: CreateCountryDto) {
    return this.locations.createCountry(dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.updateCountry')
  @Patch('countries/:id')
  updateCountry(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.locations.updateCountry(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.createProvince')
  @Post('countries/:id/provinces')
  @HttpCode(HttpStatus.CREATED)
  createProvince(@Param('id') id: string, @Body() dto: CreateProvinceDto) {
    return this.locations.createProvince(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.createCity')
  @Post('provinces/:id/cities')
  @HttpCode(HttpStatus.CREATED)
  createCity(@Param('id') id: string, @Body() dto: CreateCityDto) {
    return this.locations.createCity(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.updateCity')
  @Patch('cities/:id')
  updateCity(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.locations.updateCity(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.setDefaultCity')
  @Post('cities/:id/default')
  @HttpCode(HttpStatus.OK)
  setDefaultCity(@Param('id') id: string) {
    return this.locations.setDefaultCity(id);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.toggleCity')
  @Patch('cities/:id/toggle')
  toggleCity(@Param('id') id: string, @Body() dto: ToggleActiveDto) {
    return this.locations.toggleCity(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.createArea')
  @Post('cities/:id/areas')
  @HttpCode(HttpStatus.CREATED)
  createArea(@Param('id') id: string, @Body() dto: CreateAreaDto) {
    return this.locations.createArea(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.updateArea')
  @Patch('areas/:id')
  updateArea(@Param('id') id: string, @Body() dto: UpdateAreaDto) {
    return this.locations.updateArea(id, dto);
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Audit('location.deleteArea')
  @Delete('areas/:id')
  deleteArea(@Param('id') id: string) {
    return this.locations.deleteArea(id);
  }

  /** Full country → province → city → area tree for the admin locations manager. */
  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Get('tree')
  getTree() {
    return this.locations.getTree();
  }
}
