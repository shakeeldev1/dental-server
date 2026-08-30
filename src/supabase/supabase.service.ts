import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Wraps the Supabase service-role client used for privileged, server-side work
 * (cron reminders, bulk campaigns, webhook ingestion). The service-role key
 * bypasses RLS by design and must never reach the frontend.
 *
 * If credentials are not yet configured the client stays null and getClient()
 * throws a clear error — so the app still boots during early development.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('supabase.url');
    const key = this.config.get<string>('supabase.serviceRoleKey');

    if (!url || !key) {
      this.logger.warn(
        'Supabase is not configured yet (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). ' +
          'Database features are disabled until credentials are provided.',
      );
      return;
    }

    this.client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.logger.log('Supabase service-role client initialized.');
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error(
        'Supabase client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env',
      );
    }
    return this.client;
  }
}
