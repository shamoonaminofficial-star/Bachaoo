import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** Canonical role keys, e.g. ['CUSTOMER', 'BUSINESS_OWNER']. Replaces the full set. */
export class AssignRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles!: string[];
}
