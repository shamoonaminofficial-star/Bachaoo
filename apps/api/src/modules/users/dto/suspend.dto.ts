import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SuspendDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
