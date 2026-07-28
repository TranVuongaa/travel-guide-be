import { Module } from '@nestjs/common';

import { PrismaModule } from '../database/prisma.module';
import { ContentEngagementService } from './services/content-engagement.service';
import { ContentTargetsService } from './services/content-targets.service';

@Module({
  imports: [PrismaModule],
  providers: [ContentEngagementService, ContentTargetsService],
  exports: [ContentEngagementService, ContentTargetsService],
})
export class ContentTargetsModule {}
