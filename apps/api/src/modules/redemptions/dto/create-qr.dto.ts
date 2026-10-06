import { IsOptional, IsUUID } from 'class-validator';

export class CreateQrDto {
  @IsUUID()
  dealId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
