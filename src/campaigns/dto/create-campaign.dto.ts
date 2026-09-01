import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export type AudienceType = 'all' | 'recent' | 'inactive' | 'csv';

export class CampaignRecipientDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  phone!: string;
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  offer?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  message!: string;

  @IsIn(['all', 'recent', 'inactive', 'csv'])
  audience_type!: AudienceType;

  /** Uploaded contact list; required when audience_type is 'csv'. */
  @ValidateIf((o: CreateCampaignDto) => o.audience_type === 'csv')
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CampaignRecipientDto)
  recipients?: CampaignRecipientDto[];
}
