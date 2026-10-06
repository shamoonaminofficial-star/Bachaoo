import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CreateFavoriteDto, FavoriteQueryDto } from './favorites.dto';

@ApiTags('favorites')
@Controller('favorites')
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: FavoriteQueryDto) {
    return this.favorites.list(userId, query);
  }

  @Get('check')
  check(
    @CurrentUser('id') userId: string,
    @Query('targetType') targetType: 'deal' | 'business',
    @Query('targetId') targetId: string,
  ) {
    if (!targetType || !targetId) {
      return { favorited: false, favoriteId: null };
    }
    return this.favorites.check(userId, targetType, targetId);
  }

  @Audit('favorite.add')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  add(@CurrentUser('id') userId: string, @Body() dto: CreateFavoriteDto) {
    return this.favorites.add(userId, dto);
  }

  @Audit('favorite.remove')
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.favorites.remove(userId, id);
  }
}
