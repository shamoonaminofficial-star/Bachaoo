import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export const USER_SORT_FIELDS = ['createdAt', 'firstName', 'lastName', 'email', 'updatedAt'];

export class UserQueryDto {
  @IsOptional()
  @IsString()
  q?: string; // search across name, email, phone

  @IsOptional()
  @IsString()
  role?: string; // canonical role key, e.g. CUSTOMER

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';

  @IsOptional()
  @IsUUID()
  cityId?: string;

  /** 'true' | 'false' — filter by presence of an ACTIVE membership. */
  @IsOptional()
  @IsIn(['true', 'false'])
  hasMembership?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
