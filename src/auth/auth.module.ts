import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';

/**
 * Provides the auth guards so other feature modules can apply them via
 * @UseGuards(SupabaseAuthGuard, RolesGuard).
 */
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, RolesGuard],
  exports: [SupabaseAuthGuard, RolesGuard],
})
export class AuthModule {}
