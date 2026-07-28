import { Module } from '@nestjs/common';

import { ContentTargetsModule } from '../../common/content-targets.module';
import { PrismaModule } from '../../database/prisma.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [PrismaModule, ContentTargetsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
