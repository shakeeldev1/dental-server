import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MediaModule } from '../media/media.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignSchedulerService } from './campaign-scheduler.service';

@Module({
  imports: [AuthModule, WhatsappModule, MediaModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignSchedulerService],
})
export class CampaignsModule {}
