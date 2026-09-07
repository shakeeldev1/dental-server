import { IsUUID } from 'class-validator';

export class SendReviewDto {
  @IsUUID()
  patientId!: string;
}
