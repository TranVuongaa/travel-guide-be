import { Module } from '@nestjs/common';

import { ContentTargetsModule } from '../../common/content-targets.module';
import { PrismaModule } from '../../database/prisma.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [PrismaModule, ContentTargetsModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
