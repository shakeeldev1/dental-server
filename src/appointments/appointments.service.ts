import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { TemplatesService, type LanguageCode } from '../templates/templates.service';
import { MessagesService } from '../whatsapp/messages.service';
import { formatClinicDate, formatClinicTime, clinicToday } from '../common/clinic-time';
import type { CompleteAppointmentDto } from './dto/complete-appointment.dto';

export interface ConfirmResult {
  ok: boolean;
  alreadySent: boolean;
  error: string | null;
}

export interface CompleteResult {
  ok: boolean;
  review: { ok: boolean; alreadySent: boolean; error: string | null };
}

interface AppointmentRow {
  id: string;
  patient_id: string;
  scheduled_at: string;
  doctor_name: string | null;
  treatment: string | null;
  status: string;
  confirmation_sent: boolean;
  patients: {
    full_name: string;
    phone: string;
    preferred_language: LanguageCode;
  } | null;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly templates: TemplatesService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * Sends the WhatsApp confirmation for an appointment (spec §10, §13).
   * Idempotent: skips if already sent; only sets confirmation_sent on a
   * successful provider response. Not sent for cancelled/no-show/completed.
   */
  async sendConfirmation(appointmentId: string, userId: string | null): Promise<ConfirmResult> {
    const db = this.supabase.getClient();

    const { data, error } = await db
      .from('appointments')
      .select(
        'id, patient_id, scheduled_at, doctor_name, treatment, status, confirmation_sent, ' +
          'patients(full_name, phone, preferred_language)',
      )
      .eq('id', appointmentId)
      .single();

    if (error || !data) throw new NotFoundException('Appointment not found');
    const appt = data as unknown as AppointmentRow;

    if (appt.confirmation_sent) return { ok: true, alreadySent: true, error: null };
    if (!['pending', 'confirmed'].includes(appt.status)) {
      return { ok: false, alreadySent: false, error: `Cannot confirm a ${appt.status} appointment` };
    }
    if (!appt.patients) throw new NotFoundException('Patient not found for appointment');

    const settings = await this.templates.getSettings();
    const language: LanguageCode = appt.patients.preferred_language ?? settings.default_language;
    const tz = settings.clinic_timezone;

    const body = await this.templates.render('appointment_confirmation', language, {
      patient_name: appt.patients.full_name,
      clinic_name: settings.clinic_name,
      appointment_date: formatClinicDate(appt.scheduled_at, tz),
      appointment_time: formatClinicTime(appt.scheduled_at, tz),
      doctor_name: appt.doctor_name ?? '',
      treatment: appt.treatment ?? '',
    });

    const outcome = await this.messages.send({
      phone: appt.patients.phone,
      patientId: appt.patient_id,
      appointmentId: appt.id,
      type: 'confirmation',
      body,
      createdBy: userId,
    });

    if (outcome.ok) {
      await db.from('appointments').update({ confirmation_sent: true }).eq('id', appt.id);
    } else {
      this.logger.warn(`Confirmation not sent for ${appt.id}: ${outcome.error}`);
    }

    return { ok: outcome.ok, alreadySent: false, error: outcome.error };
  }

  /**
   * Marks an appointment completed (spec §17), records a treatment-history row,
   * and sends the review request (spec §18). Review is best-effort and
   * idempotent (review_sent flag). Cannot complete a cancelled appointment.
   */
  async complete(
    appointmentId: string,
    dto: CompleteAppointmentDto,
    userId: string | null,
  ): Promise<CompleteResult> {
    const db = this.supabase.getClient();

    const { data, error } = await db
      .from('appointments')
      .select(
        'id, patient_id, status, review_sent, doctor_name, treatment, ' +
          'patients(full_name, phone, preferred_language)',
      )
      .eq('id', appointmentId)
      .single();

    if (error || !data) throw new NotFoundException('Appointment not found');
    const appt = data as unknown as {
      id: string;
      patient_id: string;
      status: string;
      review_sent: boolean;
      doctor_name: string | null;
      treatment: string | null;
      patients: { full_name: string; phone: string; preferred_language: LanguageCode } | null;
    };

    if (appt.status === 'cancelled') {
      throw new BadRequestException('Cannot complete a cancelled appointment');
    }
    if (!appt.patients) throw new NotFoundException('Patient not found for appointment');

    const settings = await this.templates.getSettings();

    // Mark completed + record treatment history.
    await db.from('appointments').update({ status: 'completed' }).eq('id', appt.id);

    const { error: treatmentErr } = await db.from('treatments').insert({
      patient_id: appt.patient_id,
      appointment_id: appt.id,
      treatment: dto.treatment?.trim() || appt.treatment || 'Visit',
      doctor_name: dto.doctor_name?.trim() || appt.doctor_name || null,
      treatment_date: clinicToday(settings.clinic_timezone),
      next_treatment: dto.next_treatment?.trim() || null,
      next_treatment_date: dto.next_treatment_date || null,
      notes: dto.notes?.trim() || null,
      created_by: userId,
    });
    if (treatmentErr) throw new Error(treatmentErr.message);

    // Review request (best-effort, idempotent).
    if (appt.review_sent) {
      return { ok: true, review: { ok: true, alreadySent: true, error: null } };
    }

    const language: LanguageCode = appt.patients.preferred_language ?? settings.default_language;
    const body = await this.templates.render('review_request', language, {
      patient_name: appt.patients.full_name,
      clinic_name: settings.clinic_name,
      google_review_url: settings.google_review_url ?? '',
    });

    const outcome = await this.messages.send({
      phone: appt.patients.phone,
      patientId: appt.patient_id,
      appointmentId: appt.id,
      type: 'review',
      body,
      createdBy: userId,
    });

    if (outcome.ok) {
      await db.from('appointments').update({ review_sent: true }).eq('id', appt.id);
    } else {
      this.logger.warn(`Review not sent for ${appt.id}: ${outcome.error}`);
    }

    return { ok: true, review: { ok: outcome.ok, alreadySent: false, error: outcome.error } };
  }
}
