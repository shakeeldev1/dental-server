import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  /**
   * Manually run the reminder passes (admin). ?dryRun=true only reports what
   * would be selected without sending. POST /api/reminders/run
   */
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('run')
  run(@Query('dryRun') dryRun?: string) {
    return this.reminders.runAll(dryRun === 'true');
  }
}
