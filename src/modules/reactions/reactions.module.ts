import { Module } from '@nestjs/common';

import { ContentTargetsModule } from '../../common/content-targets.module';
import { PrismaModule } from '../../database/prisma.module';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [PrismaModule, ContentTargetsModule],
  controllers: [ReactionsController],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
