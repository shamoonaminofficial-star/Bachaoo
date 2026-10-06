import { IsArray, IsString } from 'class-validator';

/** Replaces the role's full permission set (permission keys, e.g. 'deal.approve'). */
export class SyncPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
