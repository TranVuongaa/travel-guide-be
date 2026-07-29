import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  RUN_TRAVEL_CONTENT_INGESTION_JOB,
  TRAVEL_CONTENT_INGESTION_QUEUE,
} from '../travel-content-ingestions.constants';
import { TravelContentIngestionJob } from '../interfaces/travel-content.interface';
import { TravelContentIngestionsService } from '../travel-content-ingestions.service';

@Injectable()
@Processor(TRAVEL_CONTENT_INGESTION_QUEUE)
export class TravelContentIngestionProcessor extends WorkerHost {
  constructor(private readonly service: TravelContentIngestionsService) {
    super();
  }

  async process(job: Job<TravelContentIngestionJob>): Promise<void> {
    if (job.name !== RUN_TRAVEL_CONTENT_INGESTION_JOB) return;
    await this.service.execute(job.data.runId, job.data.requestedById);
  }
}
