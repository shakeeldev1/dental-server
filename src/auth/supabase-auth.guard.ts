import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Verifies the Supabase Auth JWT sent as a Bearer token, loads the staff
 * profile, and attaches it to req.user. Rejects missing/invalid tokens and
 * inactive/absent profiles.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice(7);
    const client = this.supabase.getClient();

    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { data: profile, error: profileErr } = await client
      .from('users')
      .select('id, email, full_name, role, is_active')
      .eq('id', data.user.id)
      .single();

    if (profileErr || !profile || !profile.is_active) {
      throw new UnauthorizedException('No active staff profile');
    }

    (req as Request & { user: unknown }).user = profile;
    return true;
  }
}
