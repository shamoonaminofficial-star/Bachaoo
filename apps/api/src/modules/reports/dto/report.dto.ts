import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** Common date filters for reports. */
export class ReportQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsUUID() businessId?: string;
}

/** Query for GET /reports/:type/export */
export class ExportQueryDto extends ReportQueryDto {
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
}
