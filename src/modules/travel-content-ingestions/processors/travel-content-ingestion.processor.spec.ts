import { Job } from 'bullmq';

import { TravelContentIngestionJob } from '../interfaces/travel-content.interface';
import { TravelContentIngestionsService } from '../travel-content-ingestions.service';
import { TravelContentIngestionProcessor } from './travel-content-ingestion.processor';

describe('TravelContentIngestionProcessor', () => {
  it('should delegate the approved queue job to the ingestion service', async () => {
    const service = { execute: jest.fn().mockResolvedValue(undefined) };
    const processor = new TravelContentIngestionProcessor(
      service as unknown as TravelContentIngestionsService,
    );
    const data = { runId: 'run-1', requestedById: 'admin-1' };

    await processor.process({
      name: 'run-travel-content-ingestion',
      data,
    } as Job<TravelContentIngestionJob>);

    expect(service.execute).toHaveBeenCalledWith('run-1', 'admin-1');
  });
});
