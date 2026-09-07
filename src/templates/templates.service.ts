import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type TemplateKey =
  | 'appointment_confirmation'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'review_request'
  | 'treatment_reminder'
  | 'campaign'
  | 'no_show_followup';

export type LanguageCode = 'en' | 'ar';

export interface ClinicSettings {
  clinic_name: string;
  clinic_timezone: string;
  google_review_url: string | null;
  default_language: LanguageCode;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  reminder_1_hours_before: number;
  reminder_2_hours_before: number;
  treatment_reminder_enabled: boolean;
  treatment_reminder_days: number;
}

/**
 * Loads clinic settings and renders editable WhatsApp templates
 * (message_templates) by replacing {{placeholders}}. Falls back to English
 * when a template is missing in the requested language.
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSettings(): Promise<ClinicSettings> {
    const { data, error } = await this.supabase
      .getClient()
      .from('settings')
      .select('*')
      .limit(1)
      .single();
    if (error || !data) throw new Error(error?.message ?? 'Clinic settings not found');
    return data as ClinicSettings;
  }

  async render(
    key: TemplateKey,
    language: LanguageCode,
    vars: Record<string, string>,
  ): Promise<string> {
    const db = this.supabase.getClient();

    let { data } = await db
      .from('message_templates')
      .select('body')
      .eq('template_key', key)
      .eq('language', language)
      .maybeSingle();

    if (!data && language !== 'en') {
      ({ data } = await db
        .from('message_templates')
        .select('body')
        .eq('template_key', key)
        .eq('language', 'en')
        .maybeSingle());
    }

    return this.fill(data?.body ?? '', vars);
  }

  private fill(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
  }
}
