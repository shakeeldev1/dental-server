import { Global, Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';

/** Global so any module (confirmations, reminders, campaigns) can render templates. */
@Global()
@Module({
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
