import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface CloudinaryUploadResult {
  ok: boolean;
  url: string | null;
  error: string | null;
}

/**
 * Signed upload to Cloudinary's REST API. Uses a raw signed multipart POST
 * (Cloudinary's documented signature algorithm) instead of the `cloudinary`
 * SDK, so the API secret never leaves the server.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    const { cloudName, apiKey, apiSecret } = this.cfg();
    return Boolean(cloudName && apiKey && apiSecret);
  }

  private cfg() {
    return {
      cloudName: this.config.get<string>('cloudinary.cloudName') ?? '',
      apiKey: this.config.get<string>('cloudinary.apiKey') ?? '',
      apiSecret: this.config.get<string>('cloudinary.apiSecret') ?? '',
      folder: this.config.get<string>('cloudinary.folder') ?? '',
    };
  }

  async uploadImage(buffer: Buffer, filename: string): Promise<CloudinaryUploadResult> {
    const { cloudName, apiKey, apiSecret, folder } = this.cfg();
    if (!cloudName || !apiKey || !apiSecret) {
      return {
        ok: false,
        url: null,
        error:
          'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).',
      };
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const paramsToSign: Record<string, string> = { timestamp };
    if (folder) paramsToSign.folder = folder;
    const signature = this.sign(paramsToSign, apiSecret);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), filename);
    form.append('api_key', apiKey);
    form.append('timestamp', timestamp);
    if (folder) form.append('folder', folder);
    form.append('signature', signature);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const err = json?.error as { message?: string } | undefined;
        return { ok: false, url: null, error: err?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, url: (json.secure_url as string) ?? null, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      this.logger.error(`Cloudinary upload failed: ${message}`);
      return { ok: false, url: null, error: message };
    }
  }

  /** Cloudinary signing: sort params, join as k=v&k=v, append api_secret, SHA-1 hex. */
  private sign(params: Record<string, string>, apiSecret: string): string {
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    return createHash('sha1').update(`${toSign}${apiSecret}`).digest('hex');
  }
}
