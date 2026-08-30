import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  /** Send the WhatsApp confirmation for an appointment. POST /api/appointments/:id/confirm */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.appointments.sendConfirmation(id, user.id);
  }

  /** Complete an appointment: record treatment + send review. POST /api/appointments/:id/complete */
  @UseGuards(SupabaseAuthGuard)
  @Post(':id/complete')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appointments.complete(id, dto, user.id);
  }
}
