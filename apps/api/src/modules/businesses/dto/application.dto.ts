import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PAK_PHONE = /^(\+92|0)3\d{9}$/;
const optionalUrlMsg = 'must be a valid URL';

/** Partner application — public submission. Documents arrive as multipart files. */
export class CreateApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  businessName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @IsString()
  @MaxLength(160)
  email!: string;

  @IsString()
  @Matches(PAK_PHONE, { message: 'phone must be a valid Pakistani number' })
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(PAK_PHONE, { message: 'whatsapp must be a valid Pakistani number' })
  whatsapp?: string;

  @IsUUID()
  categoryId!: string;

  @IsUUID()
  cityId!: string;

  @IsOptional()
  @IsUUID()
  areaId?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @IsUrl({}, { message: optionalUrlMsg })
  mapsUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: optionalUrlMsg })
  website?: string;

  @IsOptional()
  @IsUrl({}, { message: optionalUrlMsg })
  instagram?: string;

  @IsOptional()
  @IsUrl({}, { message: optionalUrlMsg })
  facebook?: string;

  @IsString()
  @MinLength(20, { message: 'Tell us a bit more about the business (at least 20 characters).' })
  @MaxLength(2000)
  description!: string;
}

/** Admin review decision. Reason is required for REJECTED / MORE_INFO_REQUIRED. */
export class ReviewApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ApplicationQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'MORE_INFO_REQUIRED'])
  status?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
