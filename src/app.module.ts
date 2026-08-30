import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { TemplatesModule } from './templates/templates.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { RemindersModule } from './reminders/reminders.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { UsersModule } from './users/users.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    // Enables @Cron scheduled jobs (24h / 2h / treatment reminders) — added in later phases.
    ScheduleModule.forRoot(),
    SupabaseModule,
    AuthModule,
    TemplatesModule,
    WhatsappModule,
    AppointmentsModule,
    RemindersModule,
    CampaignsModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
