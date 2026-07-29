import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module';
import { OxylabsClient } from './oxylabs.client';
import { TravelContentIngestionRunner } from './travel-content-ingestion.runner';
import { TravelContentIngestionsController } from './travel-content-ingestions.controller';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [PrismaModule],
  controllers: [TravelContentIngestionsController],
  providers: [
    TravelContentIngestionsService,
    OxylabsClient,
    ...(isTest ? [] : [TravelContentIngestionRunner]),
  ],
})
export class TravelContentIngestionsModule {}
