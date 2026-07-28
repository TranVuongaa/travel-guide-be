import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ContentTargetsModule } from '../../common/content-targets.module';
import { PrismaModule } from '../../database/prisma.module';
import { PlaceReviewsController } from './place-reviews.controller';
import { PlaceRatingProcessor } from './processors/place-rating.processor';
import { PLACE_RATING_QUEUE } from './reviews.constants';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

const isTest = process.env.NODE_ENV === 'test';
const processorProviders = isTest ? [] : [PlaceRatingProcessor];
const queueImports = isTest
  ? []
  : [BullModule.registerQueue({ name: PLACE_RATING_QUEUE })];
const queueProviders = isTest
  ? [
      {
        provide: getQueueToken(PLACE_RATING_QUEUE),
        useValue: { add: () => Promise.resolve(undefined) },
      },
    ]
  : [];

@Module({
  imports: [PrismaModule, ContentTargetsModule, ...queueImports],
  controllers: [PlaceReviewsController, ReviewsController],
  providers: [ReviewsService, ...processorProviders, ...queueProviders],
  exports: [ReviewsService],
})
export class ReviewsModule {}
