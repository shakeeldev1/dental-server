import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../supabase/supabase.service';
import { TemplatesService, type LanguageCode, type TemplateKey } from '../templates/templates.service';
import { MessagesService, type MessageType } from '../whatsapp/messages.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { formatClinicDate, formatClinicTime, clinicToday, addDays } from '../common/clinic-time';

const HOUR = 3600 * 1000;

interface ApptRow {
  id: string;
  patient_id: string;
  scheduled_at: string;
  doctor_name: string | null;
  treatment: string | null;
  patients: { full_name: string; phone: string; preferred_language: LanguageCode } | null;
}

export interface ReminderReport {
  kind: '24h' | '2h' | 'treatment';
  matched: number;
  sent: number;
  failed: number;
  skipped?: string;
}

interface TreatmentRow {
  id: string;
  patient_id: string;
  next_treatment: string | null;
  next_treatment_date: string | null;
  patients: { full_name: string; phone: string; preferred_language: LanguageCode } | null;
}

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly templates: TemplatesService,
    private readonly messages: MessagesService,
    private readonly wa: WhatsappService,
  ) {}

  /** Runs every 15 minutes. Skips entirely if WhatsApp is not configured yet. */
  @Cron('0 */15 * * * *')
  async handleCron(): Promise<void> {
    if (!this.wa.isConfigured) {
      this.logger.debug('Reminder cron skipped — WhatsApp not configured.');
      return;
    }
    const reports = await this.runAll(false);
    for (const r of reports) {
      if (r.matched > 0) {
        this.logger.log(`Reminder ${r.kind}: matched=${r.matched} sent=${r.sent} failed=${r.failed}`);
      }
    }
  }

  async runAll(dryRun: boolean): Promise<ReminderReport[]> {
    return [
      await this.run24h(dryRun),
      await this.run2h(dryRun),
      await this.runTreatmentReminders(dryRun),
    ];
  }

  /** Next-treatment reminders (spec §19): fire treatment_reminder_days before the date. */
  async runTreatmentReminders(dryRun: boolean): Promise<ReminderReport> {
    const settings = await this.templates.getSettings();
    if (!settings.treatment_reminder_enabled) {
      return { kind: 'treatment', matched: 0, sent: 0, failed: 0, skipped: 'disabled' };
    }
    const db = this.supabase.getClient();
    const today = clinicToday(settings.clinic_timezone);
    const cutoff = addDays(today, settings.treatment_reminder_days);

    const { data, error } = await db
      .from('treatments')
      .select('id, patient_id, next_treatment, next_treatment_date, patients(full_name, phone, preferred_language)')
      .eq('treatment_reminder_sent', false)
      .not('next_treatment_date', 'is', null)
      .lte('next_treatment_date', cutoff);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as TreatmentRow[];

    const report: ReminderReport = { kind: 'treatment', matched: rows.length, sent: 0, failed: 0 };
    if (dryRun) return report;

    for (const t of rows) {
      if (!t.patients) continue;
      const lang = t.patients.preferred_language ?? settings.default_language;
      const body = await this.templates.render('treatment_reminder', lang, {
        patient_name: t.patients.full_name,
        clinic_name: settings.clinic_name,
        next_treatment: t.next_treatment ?? '',
      });
      const outcome = await this.messages.send({
        phone: t.patients.phone,
        patientId: t.patient_id,
        type: 'treatment_reminder',
        body,
      });
      if (outcome.ok) {
        await db.from('treatments').update({ treatment_reminder_sent: true }).eq('id', t.id);
        report.sent += 1;
      } else {
        report.failed += 1;
      }
    }
    return report;
  }

  async run24h(dryRun: boolean): Promise<ReminderReport> {
    const settings = await this.templates.getSettings();
    if (!settings.reminder_24h_enabled) {
      return { kind: '24h', matched: 0, sent: 0, failed: 0, skipped: 'disabled' };
    }
    const now = Date.now();
    // Window: more than 2h away (2h job handles the rest) and within 24h.
    const from = new Date(now + 2 * HOUR).toISOString();
    const to = new Date(now + 24 * HOUR).toISOString();
    return this.process('24h', 'reminder_24h', 'reminder_24h_sent', from, to, dryRun, settings.clinic_timezone, settings.clinic_name, settings.default_language);
  }

  async run2h(dryRun: boolean): Promise<ReminderReport> {
    const settings = await this.templates.getSettings();
    if (!settings.reminder_2h_enabled) {
      return { kind: '2h', matched: 0, sent: 0, failed: 0, skipped: 'disabled' };
    }
    const now = Date.now();
    // Window: from now up to 2h away.
    const from = new Date(now).toISOString();
    const to = new Date(now + 2 * HOUR).toISOString();
    return this.process('2h', 'reminder_2h', 'reminder_2h_sent', from, to, dryRun, settings.clinic_timezone, settings.clinic_name, settings.default_language);
  }

  private async process(
    kind: '24h' | '2h',
    templateKey: Extract<TemplateKey, 'reminder_24h' | 'reminder_2h'>,
    flagColumn: 'reminder_24h_sent' | 'reminder_2h_sent',
    fromISO: string,
    toISO: string,
    dryRun: boolean,
    tz: string,
    clinicName: string,
    defaultLang: LanguageCode,
  ): Promise<ReminderReport> {
    const db = this.supabase.getClient();
    const { data, error } = await db
      .from('appointments')
      .select('id, patient_id, scheduled_at, doctor_name, treatment, patients(full_name, phone, preferred_language)')
      .in('status', ['pending', 'confirmed'])
      .eq(flagColumn, false)
      .gt('scheduled_at', fromISO)
      .lte('scheduled_at', toISO);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as ApptRow[];

    const report: ReminderReport = { kind, matched: rows.length, sent: 0, failed: 0 };
    if (dryRun) return report;

    const messageType: MessageType = templateKey;
    for (const appt of rows) {
      if (!appt.patients) continue;
      const lang = appt.patients.preferred_language ?? defaultLang;
      const body = await this.templates.render(templateKey, lang, {
        patient_name: appt.patients.full_name,
        clinic_name: clinicName,
        appointment_date: formatClinicDate(appt.scheduled_at, tz),
        appointment_time: formatClinicTime(appt.scheduled_at, tz),
        doctor_name: appt.doctor_name ?? '',
      });

      const outcome = await this.messages.send({
        phone: appt.patients.phone,
        patientId: appt.patient_id,
        appointmentId: appt.id,
        type: messageType,
        body,
      });

      if (outcome.ok) {
        await db.from('appointments').update({ [flagColumn]: true }).eq('id', appt.id);
        report.sent += 1;
      } else {
        report.failed += 1;
      }
    }
    return report;
  }
}
