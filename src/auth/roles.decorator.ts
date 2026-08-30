import { SetMetadata } from '@nestjs/common';
import type { Role } from './current-user.decorator';

export const ROLES_KEY = 'roles';

/** Restrict a route to specific roles, e.g. @Roles('admin'). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
