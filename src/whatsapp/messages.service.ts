import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';

export type MessageType =
  | 'confirmation'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'review'
  | 'treatment_reminder'
  | 'campaign'
  | 'manual';

export interface SendParams {
  phone: string;
  type: MessageType;
  body: string;
  patientId?: string | null;
  appointmentId?: string | null;
  campaignId?: string | null;
  createdBy?: string | null;
}

export interface SendOutcome {
  ok: boolean;
  error: string | null;
  messageId: string | null;
}

/**
 * Orchestrates "send + log": writes a whatsapp_messages row, calls the provider,
 * then marks the row sent/failed. A message is only 'sent' on a successful
 * provider response (spec §29). Used by manual sends, confirmations, reminders,
 * reviews, treatment reminders and campaigns.
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly wa: WhatsappService,
    private readonly supabase: SupabaseService,
  ) {}

  async send(params: SendParams): Promise<SendOutcome> {
    const db = this.supabase.getClient();

    const { data: log, error: insertErr } = await db
      .from('whatsapp_messages')
      .insert({
        patient_id: params.patientId ?? null,
        appointment_id: params.appointmentId ?? null,
        campaign_id: params.campaignId ?? null,
        phone: params.phone,
        direction: 'outbound',
        message_type: params.type,
        body: params.body,
        status: 'pending',
        created_by: params.createdBy ?? null,
      })
      .select('id')
      .single();

    if (insertErr || !log) {
      throw new Error(insertErr?.message ?? 'Could not create message log');
    }

    const result = await this.wa.sendText(params.phone, params.body);

    const { error: updateErr } = await db
      .from('whatsapp_messages')
      .update({
        status: result.ok ? 'sent' : 'failed',
        provider_message_id: result.providerMessageId,
        error_message: result.error,
      })
      .eq('id', log.id);

    if (updateErr) {
      this.logger.error(`Failed to update message log ${log.id}: ${updateErr.message}`);
    }

    return { ok: result.ok, error: result.error, messageId: log.id };
  }

  /**
   * Best-effort logging of an inbound message. The provider's exact webhook
   * payload is confirmed once the webhook is live; until then we extract common
   * fields and store what we can so real payloads can be inspected.
   */
  async logInbound(phone: string | null, body: string | null, patientId?: string | null) {
    if (!phone) return;
    const db = this.supabase.getClient();
    await db.from('whatsapp_messages').insert({
      patient_id: patientId ?? null,
      phone,
      direction: 'inbound',
      message_type: 'manual',
      body: body ?? null,
      status: 'sent',
    });
  }
}
