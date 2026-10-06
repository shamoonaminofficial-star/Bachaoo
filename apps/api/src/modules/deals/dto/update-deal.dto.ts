import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDealDto } from './create-deal.dto';

/** Partners can edit everything except the owning business. */
export class UpdateDealDto extends PartialType(OmitType(CreateDealDto, ['businessId'])) {}
