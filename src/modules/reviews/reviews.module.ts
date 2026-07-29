import { Module } from '@nestjs/common';

import { ContentTargetsModule } from '../../common/content-targets.module';
import { PrismaModule } from '../../database/prisma.module';
import { PlaceReviewsController } from './place-reviews.controller';
import { PlaceRatingService } from './place-rating.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [PrismaModule, ContentTargetsModule],
  controllers: [PlaceReviewsController, ReviewsController],
  providers: [ReviewsService, PlaceRatingService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
