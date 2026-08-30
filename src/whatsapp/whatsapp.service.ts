import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProviderResult {
  ok: boolean;
  providerMessageId: string | null;
  error: string | null;
  raw: unknown;
}

/**
 * Low-level client for the QR-session WhatsApp provider (custom2.waghl.com).
 * All requests are POST with { api_key, sender, number, ... } in the body.
 * The recipient number is sent digits-only (country code, no '+').
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    const { apiUrl, apiKey, sender } = this.cfg();
    return Boolean(apiUrl && apiKey && sender);
  }

  private cfg() {
    return {
      apiUrl: this.config.get<string>('whatsapp.apiUrl') ?? '',
      apiKey: this.config.get<string>('whatsapp.apiKey') ?? '',
      sender: this.config.get<string>('whatsapp.sender') ?? '',
    };
  }

  /** E.164 (+9745…) → provider format (digits only, no '+'). */
  private toProviderNumber(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  sendText(toPhone: string, message: string): Promise<ProviderResult> {
    return this.post('/send-message', { number: this.toProviderNumber(toPhone), message });
  }

  sendMedia(
    toPhone: string,
    mediaType: 'image' | 'video' | 'audio',
    url: string,
    caption?: string,
  ): Promise<ProviderResult> {
    return this.post('/send-media', {
      number: this.toProviderNumber(toPhone),
      media_type: mediaType,
      url,
      ...(caption ? { caption } : {}),
    });
  }

  sendDocument(toPhone: string, url: string, caption?: string): Promise<ProviderResult> {
    return this.post('/send-document', {
      number: this.toProviderNumber(toPhone),
      media_type: 'document',
      url,
      ...(caption ? { caption } : {}),
    });
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<ProviderResult> {
    const { apiUrl, apiKey, sender } = this.cfg();
    if (!apiUrl || !apiKey || !sender) {
      return {
        ok: false,
        providerMessageId: null,
        error: 'WhatsApp is not configured (WHATSAPP_API_URL / WHATSAPP_API_KEY / WHATSAPP_SENDER).',
        raw: null,
      };
    }

    const url = `${apiUrl.replace(/\/$/, '')}${path}`;
    const body = { api_key: apiKey, sender, ...payload };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }

      const statusTrue = json?.status === true || json?.status === 'true';
      const ok = res.ok && statusTrue;
      return {
        ok,
        providerMessageId:
          (json?.message_id as string) ?? (json?.id as string) ?? null,
        error: ok ? null : ((json?.msg as string) ?? `HTTP ${res.status}`),
        raw: json,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      this.logger.error(`WhatsApp POST ${path} failed: ${message}`);
      return { ok: false, providerMessageId: null, error: message, raw: null };
    }
  }
}
