import { IsIn, IsUUID } from 'class-validator';

export class CreateFavoriteDto {
  @IsIn(['deal', 'business'])
  targetType!: 'deal' | 'business';

  @IsUUID()
  targetId!: string;
}

export class FavoriteQueryDto {
  @IsIn(['deal', 'business'])
  type?: 'deal' | 'business';

  page?: number = 1;
  pageSize?: number = 20;
}
