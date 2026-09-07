import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, type AudienceType, type SegmentFilters } from './dto/create-campaign.dto';

@Controller('campaigns')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('admin')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  /** Recipient count for an audience (preview). GET /api/campaigns/audience-count?type=&filters= */
  @Get('audience-count')
  audienceCount(@Query('type') type: AudienceType, @Query('filters') filters?: string) {
    let parsed: SegmentFilters | undefined;
    if (filters) {
      try {
        parsed = JSON.parse(filters) as SegmentFilters;
      } catch {
        parsed = undefined;
      }
    }
    return this.campaigns.audienceCount(type ?? 'all', parsed);
  }

  /** Create a draft campaign. POST /api/campaigns */
  @Post()
  create(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.campaigns.create(dto, user.id);
  }

  /** Build recipients + start bulk send. POST /api/campaigns/:id/send */
  @Post(':id/send')
  send(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.send(id, user.id);
  }
}
