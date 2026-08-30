import { IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

export class CompleteAppointmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  treatment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  doctor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  next_treatment?: string;

  @IsOptional()
  @IsDateString()
  next_treatment_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
