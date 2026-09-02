import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Create a staff account. POST /api/users */
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  /** Permanently delete a staff account. DELETE /api/users/:id */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    if (id === currentUser.id) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
    return this.users.remove(id);
  }
}
