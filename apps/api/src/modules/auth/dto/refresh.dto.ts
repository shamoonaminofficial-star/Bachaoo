import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  /**
   * Optional when the `bachatly_refresh` httpOnly cookie is present — the
   * controller falls back to the cookie for browser clients.
   */
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
