import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module';
import { OxylabsClient } from './oxylabs.client';
import { TravelContentIngestionProcessor } from './processors/travel-content-ingestion.processor';
import { TRAVEL_CONTENT_INGESTION_QUEUE } from './travel-content-ingestions.constants';
import { TravelContentIngestionsController } from './travel-content-ingestions.controller';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

const isTest = process.env.NODE_ENV === 'test';
const queueImports = isTest
  ? []
  : [BullModule.registerQueue({ name: TRAVEL_CONTENT_INGESTION_QUEUE })];
const queueProviders = isTest
  ? [
      {
        provide: getQueueToken(TRAVEL_CONTENT_INGESTION_QUEUE),
        useValue: { add: () => Promise.resolve(undefined) },
      },
    ]
  : [];

@Module({
  imports: [PrismaModule, ...queueImports],
  controllers: [TravelContentIngestionsController],
  providers: [
    TravelContentIngestionsService,
    OxylabsClient,
    ...(isTest ? [] : [TravelContentIngestionProcessor]),
    ...queueProviders,
  ],
})
export class TravelContentIngestionsModule {}
