import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type AudienceType = 'all' | 'recent' | 'inactive';

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

  @IsIn(['all', 'recent', 'inactive'])
  audience_type!: AudienceType;
}
