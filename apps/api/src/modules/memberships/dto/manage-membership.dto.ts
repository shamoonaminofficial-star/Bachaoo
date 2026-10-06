import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ExtendMembershipDto {
  /** Whole days to add to the current end date. */
  @IsInt()
  @Min(1)
  days!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class CancelMembershipDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class AssignMembershipDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @IsUUID()
  planId!: string;

  /** Duration in days; defaults to the plan's durationDays. */
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class MembershipQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
