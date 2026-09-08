import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export type AudienceType = 'all' | 'recent' | 'inactive' | 'csv' | 'segment';

/** All fields optional; every present key is applied as an additional filter. */
export interface SegmentFilters {
  doctor_id?: string;
  service_id?: string;
  lead_source?: string[];
  customer_type?: 'individual' | 'family';
  customer_status?: string[];
  last_appointment_status?: string[];
  has_no_show?: boolean;
  has_completed?: boolean;
  review_requested?: boolean;
  created_after?: string;
  created_before?: string;
  last_contact_after?: string;
  last_contact_before?: string;
}

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

  @IsIn(['all', 'recent', 'inactive', 'csv', 'segment'])
  audience_type!: AudienceType;

  /** Uploaded contact list; required when audience_type is 'csv'. */
  @ValidateIf((o: CreateCampaignDto) => o.audience_type === 'csv')
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CampaignRecipientDto)
  recipients?: CampaignRecipientDto[];

  /** Filter criteria; only used (and stored) when audience_type is 'segment'. */
  @ValidateIf((o: CreateCampaignDto) => o.audience_type === 'segment')
  @IsObject()
  segment_filters?: SegmentFilters;

  /** Public URL of an uploaded campaign image (spec: image + message via WGL). */
  @IsOptional()
  @IsUrl({ require_protocol: true })
  image_url?: string;

  /** Per-campaign override of settings.campaign_daily_limit. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  daily_limit?: number;

  /** Per-campaign override of settings.campaign_send_interval_seconds. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  send_interval_seconds?: number;
}
