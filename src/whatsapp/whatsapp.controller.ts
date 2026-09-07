import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { SendReviewDto } from './dto/send-review.dto';
import { TemplatesService, type LanguageCode } from '../templates/templates.service';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly wa: WhatsappService,
    private readonly messages: MessagesService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly templates: TemplatesService,
  ) {}

  /** Provider connection status. GET /api/whatsapp/status */
  @UseGuards(SupabaseAuthGuard)
  @Get('status')
  status() {
    return { configured: this.wa.isConfigured };
  }

  /** Send an individual message to a patient or raw phone. POST /api/whatsapp/send */
  @UseGuards(SupabaseAuthGuard)
  @Post('send')
  async send(@Body() dto: SendMessageDto, @CurrentUser() user: AuthUser) {
    let phone = dto.phone?.trim();
    const patientId = dto.patientId ?? null;

    if (patientId) {
      const { data, error } = await this.supabase
        .getClient()
        .from('patients')
        .select('phone')
        .eq('id', patientId)
        .single();
      if (error || !data) throw new BadRequestException('Patient not found');
      phone = data.phone;
    }

    if (!phone) throw new BadRequestException('Provide patientId or phone');

    return this.messages.send({
      phone,
      patientId,
      type: 'manual',
      body: dto.message,
      createdBy: user.id,
    });
  }

  /**
   * Send a review request to a patient directly from their profile, independent
   * of appointment completion. Reuses the same render+send path as
   * AppointmentsService.complete(). POST /api/whatsapp/send-review
   */
  @UseGuards(SupabaseAuthGuard)
  @Post('send-review')
  async sendReview(@Body() dto: SendReviewDto, @CurrentUser() user: AuthUser) {
    const { data: patient, error } = await this.supabase
      .getClient()
      .from('patients')
      .select('full_name, phone, preferred_language')
      .eq('id', dto.patientId)
      .single();
    if (error || !patient) throw new BadRequestException('Patient not found');

    const settings = await this.templates.getSettings();
    const language: LanguageCode = patient.preferred_language ?? settings.default_language;
    const body = await this.templates.render('review_request', language, {
      patient_name: patient.full_name,
      clinic_name: settings.clinic_name,
      google_review_url: settings.google_review_url ?? '',
    });

    return this.messages.send({
      phone: patient.phone,
      patientId: dto.patientId,
      type: 'review',
      body,
      createdBy: user.id,
    });
  }

  /**
   * Incoming-message webhook (provider → us). Public endpoint; if
   * WHATSAPP_WEBHOOK_SECRET is set, it must match ?secret=. The exact payload
   * format is confirmed once live — for now we log best-effort and store raw.
   * POST /api/whatsapp/webhook
   */
  @Post('webhook')
  async webhook(@Body() body: Record<string, unknown>, @Query('secret') secret?: string) {
    const expected = this.config.get<string>('whatsapp.webhookSecret');
    if (expected && secret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    this.logger.log(`Inbound webhook payload: ${JSON.stringify(body).slice(0, 1000)}`);

    const phone = this.extractString(body, ['number', 'from', 'sender', 'phone', 'msisdn']);
    const text = this.extractString(body, ['message', 'text', 'body', 'msg']);
    if (phone) {
      await this.messages
        .logInbound(this.normalize(phone), text)
        .catch((e) => this.logger.error(`logInbound failed: ${e}`));
    }

    return { received: true };
  }

  private extractString(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  private normalize(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return digits ? `+${digits}` : raw;
  }
}
