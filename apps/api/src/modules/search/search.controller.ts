import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get()
  searchAll(@Query('q') q: string) {
    return this.search.search(q);
  }

  @Public()
  @Get('suggest')
  suggest(@Query('q') q: string) {
    return this.search.suggest(q);
  }
}
