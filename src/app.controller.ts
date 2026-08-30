import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from './supabase/supabase.service';

@Controller()
export class AppController {
  constructor(private readonly supabase: SupabaseService) {}

  /** Liveness + configuration check. GET /api/health */
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'expert-dental-crm',
      supabaseConfigured: this.supabase.isConfigured,
      timestamp: new Date().toISOString(),
    };
  }
}
