import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { TemplatesService, type ClinicSettings } from '../templates/templates.service';
import { MessagesService } from '../whatsapp/messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { clinicToday } from '../common/clinic-time';

interface CampaignRow {
  id: string;
  message: string;
  offer: string | null;
  image_url: string | null;
  daily_limit: number | null;
  send_interval_seconds: number | null;
  sent_today: number;
  sent_today_date: string | null;
  next_send_at: string | null;
  sent_count: number;
  failed_count: number;
}

interface RecipientRow {
  id: string;
  patient_id: string | null;
  name: string | null;
  phone: string;
}

/**
 * Trickles campaign sends out over time instead of bursting the whole
 * audience at once. Sends at most ONE message per active campaign per tick,
 * gated by:
 *  - `next_send_at` (configurable interval between messages), and
 *  - `sent_today` vs. the configurable daily limit, which resets whenever
 *    `sent_today_date` no longer matches the clinic's "today" — so once a
 *    day's batch is done, the remaining contacts automatically continue the
 *    next day with zero extra scheduling logic.
 *
 * All progress lives in the `campaigns`/`campaign_recipients` tables, so a
 * server restart just resumes from wherever the DB says it left off. The
 * in-memory `running` flag only guards against overlapping ticks within this
 * single process (this app runs on one persistent host, not a cluster).
 */
@Injectable()
export class CampaignSchedulerService {
  private readonly logger = new Logger(CampaignSchedulerService.name);
  private running = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly templates: TemplatesService,
    private readonly messages: MessagesService,
    private readonly wa: WhatsappService,
  ) {}

  @Cron('* * * * * *')
  async tick(): Promise<void> {
    if (!this.wa.isConfigured || this.running) return;
    this.running = true;
    try {
      await this.processAll();
    } catch (e) {
      this.logger.error(`Campaign scheduler tick failed: ${e}`);
    } finally {
      this.running = false;
    }
  }

  private async processAll(): Promise<void> {
    const db = this.supabase.getClient();
    const settings = await this.templates.getSettings();
    const today = clinicToday(settings.clinic_timezone);
    const now = new Date();

    const { data: campaigns, error } = await db
      .from('campaigns')
      .select(
        'id, message, offer, image_url, daily_limit, send_interval_seconds, sent_today, sent_today_date, next_send_at, sent_count, failed_count',
      )
      .eq('status', 'sending');
    if (error || !campaigns) return;

    for (const campaign of campaigns as CampaignRow[]) {
      try {
        await this.processCampaign(campaign, settings, today, now);
      } catch (e) {
        this.logger.error(`Campaign ${campaign.id} tick failed: ${e}`);
      }
    }
  }

  private async processCampaign(
    campaign: CampaignRow,
    settings: ClinicSettings,
    today: string,
    now: Date,
  ): Promise<void> {
    const db = this.supabase.getClient();

    let sentToday = campaign.sent_today;
    if (campaign.sent_today_date !== today) {
      sentToday = 0;
      await db.from('campaigns').update({ sent_today: 0, sent_today_date: today }).eq('id', campaign.id);
    }

    const dailyLimit = campaign.daily_limit ?? settings.campaign_daily_limit;
    if (sentToday >= dailyLimit) return; // today's quota used — resumes automatically tomorrow

    if (campaign.next_send_at && new Date(campaign.next_send_at) > now) return; // waiting out the interval

    const { data: recipient } = await db
      .from('campaign_recipients')
      .select('id, patient_id, name, phone')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!recipient) {
      await db.from('campaigns').update({ status: 'completed' }).eq('id', campaign.id);
      this.logger.log(`Campaign ${campaign.id} completed — no pending recipients left.`);
      return;
    }
    const r = recipient as RecipientRow;

    const body = this.fillMessage(campaign.message, {
      patient_name: r.name ?? '',
      offer: campaign.offer ?? '',
      clinic_name: settings.clinic_name,
    });

    const outcome = await this.messages.send({
      phone: r.phone,
      patientId: r.patient_id,
      campaignId: campaign.id,
      type: 'campaign',
      body,
      imageUrl: campaign.image_url ?? undefined,
    });

    await db
      .from('campaign_recipients')
      .update({
        status: outcome.ok ? 'sent' : 'failed',
        error_message: outcome.error,
        sent_at: outcome.ok ? new Date().toISOString() : null,
      })
      .eq('id', r.id);

    const intervalSeconds = campaign.send_interval_seconds ?? settings.campaign_send_interval_seconds;
    await db
      .from('campaigns')
      .update({
        sent_count: campaign.sent_count + (outcome.ok ? 1 : 0),
        failed_count: campaign.failed_count + (outcome.ok ? 0 : 1),
        sent_today: sentToday + 1,
        sent_today_date: today,
        next_send_at: new Date(now.getTime() + intervalSeconds * 1000).toISOString(),
      })
      .eq('id', campaign.id);
  }

  private fillMessage(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '');
  }
}
