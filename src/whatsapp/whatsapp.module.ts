import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappService } from './whatsapp.service';
import { MessagesService } from './messages.service';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [AuthModule],
  controllers: [WhatsappController],
  providers: [WhatsappService, MessagesService],
  exports: [WhatsappService, MessagesService],
})
export class WhatsappModule {}
