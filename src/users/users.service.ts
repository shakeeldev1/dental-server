import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Creates a staff account through Supabase Auth (real auth flow, spec §32).
   * The 0007 trigger mirrors it into public.users; we upsert to guarantee the
   * intended full_name / role / active state.
   */
  async create(dto: CreateUserDto) {
    const admin = this.supabase.getClient();

    const { data, error } = await admin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { full_name: dto.full_name, role: dto.role },
    });
    if (error) throw new BadRequestException(error.message);

    const userId = data.user.id;
    const { error: upsertErr } = await admin.from('users').upsert(
      {
        id: userId,
        email: dto.email,
        full_name: dto.full_name,
        role: dto.role,
        is_active: true,
      },
      { onConflict: 'id' },
    );
    if (upsertErr) throw new Error(upsertErr.message);

    const { data: profile } = await admin
      .from('users')
      .select('id, email, full_name, role, is_active')
      .eq('id', userId)
      .single();

    return profile;
  }

  /**
   * Permanently deletes a staff account from Supabase Auth. The FK from
   * public.users to auth.users is `on delete cascade`, so the profile row
   * is removed automatically.
   */
  async remove(id: string) {
    const admin = this.supabase.getClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new BadRequestException(error.message);
    return { id };
  }
}
