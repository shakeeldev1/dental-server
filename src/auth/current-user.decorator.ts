import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type Role = 'admin' | 'receptionist';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

/** Injects the authenticated staff profile attached by SupabaseAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
