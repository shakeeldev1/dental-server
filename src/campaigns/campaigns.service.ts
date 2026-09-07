import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { TemplatesService, type LanguageCode } from '../templates/templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import type { AudienceType, CreateCampaignDto, SegmentFilters } from './dto/create-campaign.dto';

const RECENT_DAYS = 90;
const SEND_DELAY_MS = 1100; // ~55/min, under the provider's 60/min limit
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PatientRow {
  id: string;
  full_name: string;
  phone: string;
  preferred_language: LanguageCode;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly templates: TemplatesService,
    private readonly wa: WhatsappService,
  ) {}

  /** Resolve the patient audience for a campaign (spec §21). */
  private async resolveAudience(
    type: Exclude<AudienceType, 'csv'>,
    filters?: SegmentFilters,
  ): Promise<PatientRow[]> {
    const db = this.supabase.getClient();

    if (type === 'segment') {
      let query = db.from('patient_segment_view').select('id, full_name, phone, preferred_language');
      const f = filters ?? {};
      if (f.doctor_id) query = query.eq('preferred_doctor_id', f.doctor_id);
      if (f.service_id) query = query.eq('preferred_service_id', f.service_id);
      if (f.lead_source?.length) query = query.in('lead_source', f.lead_source);
      if (f.customer_type) query = query.eq('customer_type', f.customer_type);
      if (f.customer_status?.length) query = query.in('customer_status', f.customer_status);
      if (f.last_appointment_status?.length) query = query.in('last_appointment_status', f.last_appointment_status);
      if (typeof f.has_no_show === 'boolean') query = query.eq('has_no_show', f.has_no_show);
      if (typeof f.has_completed === 'boolean') query = query.eq('has_completed', f.has_completed);
      if (typeof f.review_requested === 'boolean') query = query.eq('review_requested', f.review_requested);
      if (f.created_after) query = query.gte('created_at', f.created_after);
      if (f.created_before) query = query.lte('created_at', f.created_before);
      if (f.last_contact_after) query = query.gte('last_contact_at', f.last_contact_after);
      if (f.last_contact_before) query = query.lte('last_contact_at', f.last_contact_before);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as PatientRow[];
    }

    const { data: patients, error } = await db
      .from('patients')
      .select('id, full_name, phone, preferred_language');
    if (error) throw new Error(error.message);
    const all = (patients ?? []) as PatientRow[];
    if (type === 'all') return all;

    const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000).toISOString();
    const { data: appts, error: aErr } = await db
      .from('appointments')
      .select('patient_id')
      .gte('scheduled_at', cutoff);
    if (aErr) throw new Error(aErr.message);
    const recentIds = new Set((appts ?? []).map((a) => a.patient_id as string));

    return type === 'recent'
      ? all.filter((p) => recentIds.has(p.id))
      : all.filter((p) => !recentIds.has(p.id));
  }

  async audienceCount(type: AudienceType, filters?: SegmentFilters): Promise<{ count: number }> {
    if (type === 'csv') return { count: 0 };
    return { count: (await this.resolveAudience(type, filters)).length };
  }

  async create(dto: CreateCampaignDto, userId: string | null) {
    const db = this.supabase.getClient();
    const recipients = dto.audience_type === 'csv' ? (dto.recipients ?? []) : [];
    if (dto.audience_type === 'csv' && recipients.length === 0) {
      throw new BadRequestException('Upload at least one contact for a CSV campaign');
    }

    const { data, error } = await db
      .from('campaigns')
      .insert({
        name: dto.name,
        offer: dto.offer ?? null,
        message: dto.message,
        audience_type: dto.audience_type,
        segment_filters: dto.audience_type === 'segment' ? (dto.segment_filters ?? {}) : null,
        status: 'draft',
        total_recipients: recipients.length,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (dto.audience_type === 'csv') {
      const rows = recipients.map((r) => ({
        campaign_id: data.id as string,
        patient_id: null,
        name: r.name ?? null,
        phone: r.phone,
        status: 'pending' as const,
      }));
      const { error: insErr } = await db.from('campaign_recipients').insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    return data;
  }

  /** Build recipients + start the background send (spec §24). */
  async send(campaignId: string, userId: string | null) {
    const db = this.supabase.getClient();
    const { data: campaign, error } = await db
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (error || !campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === 'sending') {
      throw new BadRequestException('Campaign is already sending');
    }

    const audienceType = campaign.audience_type as AudienceType;

    // CSV campaigns already have their recipients materialized at creation time.
    if (audienceType === 'csv') {
      const { count } = await db
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);
      if (!count) throw new BadRequestException('Audience is empty');

      await db
        .from('campaigns')
        .update({ status: 'sending', total_recipients: count })
        .eq('id', campaignId);

      void this.processCampaign(campaignId, userId).catch((e) =>
        this.logger.error(`Campaign ${campaignId} processing failed: ${e}`),
      );

      return { status: 'sending', total: count };
    }

    const audience = await this.resolveAudience(
      audienceType,
      audienceType === 'segment' ? ((campaign.segment_filters as SegmentFilters) ?? undefined) : undefined,
    );
    if (audience.length === 0) throw new BadRequestException('Audience is empty');

    // Build recipients only on the first send; a re-send resumes pending ones
    // (duplicate protection). Plain insert — the partial unique index cannot
    // act as an ON CONFLICT arbiter.
    const { count: existing } = await db
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    if (!existing) {
      const recipients = audience.map((p) => ({
        campaign_id: campaignId,
        patient_id: p.id,
        name: p.full_name,
        phone: p.phone,
        status: 'pending' as const,
      }));
      const { error: insErr } = await db.from('campaign_recipients').insert(recipients);
      if (insErr) throw new Error(insErr.message);
    }

    const { count } = await db
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    await db
      .from('campaigns')
      .update({ status: 'sending', total_recipients: count ?? audience.length })
      .eq('id', campaignId);

    // Fire-and-forget background processing.
    void this.processCampaign(campaignId, userId).catch((e) =>
      this.logger.error(`Campaign ${campaignId} processing failed: ${e}`),
    );

    return { status: 'sending', total: count ?? audience.length };
  }

  private async processCampaign(campaignId: string, userId: string | null): Promise<void> {
    const db = this.supabase.getClient();
    const { data: campaign } = await db.from('campaigns').select('*').eq('id', campaignId).single();
    if (!campaign) return;
    const settings = await this.templates.getSettings();

    const { data: pending } = await db
      .from('campaign_recipients')
      .select('id, patient_id, name, phone')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending');

    let sent = 0;
    let failed = 0;

    for (const r of pending ?? []) {
      const body = this.fillMessage(campaign.message as string, {
        patient_name: (r.name as string) ?? '',
        offer: (campaign.offer as string) ?? '',
        clinic_name: settings.clinic_name,
      });

      let result = await this.wa.sendText(r.phone as string, body);
      if (!result.ok) result = await this.wa.sendText(r.phone as string, body); // one retry

      // Log to the message history.
      await db.from('whatsapp_messages').insert({
        patient_id: r.patient_id,
        campaign_id: campaignId,
        phone: r.phone,
        direction: 'outbound',
        message_type: 'campaign',
        body,
        status: result.ok ? 'sent' : 'failed',
        provider_message_id: result.providerMessageId,
        error_message: result.error,
        created_by: userId,
      });

      await db
        .from('campaign_recipients')
        .update({
          status: result.ok ? 'sent' : 'failed',
          provider_message_id: result.providerMessageId,
          error_message: result.error,
          sent_at: result.ok ? new Date().toISOString() : null,
        })
        .eq('id', r.id);

      if (result.ok) sent += 1;
      else failed += 1;

      await db.from('campaigns').update({ sent_count: sent, failed_count: failed }).eq('id', campaignId);
      await sleep(SEND_DELAY_MS);
    }

    await db
      .from('campaigns')
      .update({ status: sent === 0 && failed > 0 ? 'failed' : 'completed' })
      .eq('id', campaignId);
    this.logger.log(`Campaign ${campaignId} done: sent=${sent} failed=${failed}`);
  }

  private fillMessage(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '');
  }
}
