import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { CloudinaryService } from '../media/cloudinary.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, type AudienceType, type SegmentFilters } from './dto/create-campaign.dto';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller('campaigns')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('admin')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Upload a campaign image to Cloudinary. POST /api/campaigns/upload-image */
  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } }))
  async uploadImage(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image file provided.');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Please upload an image file.');
    }

    const result = await this.cloudinary.uploadImage(file.buffer, file.originalname);
    if (!result.ok || !result.url) {
      throw new BadRequestException(result.error ?? 'Image upload failed.');
    }
    return { url: result.url };
  }

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
