import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class TravelContentIngestionActiveException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.TRAVEL_INGESTION_ACTIVE,
      'A travel content ingestion run is already active',
    );
  }
}

export class TravelContentIngestionQueueUnavailableException extends DomainException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.TRAVEL_INGESTION_QUEUE_UNAVAILABLE,
      'The travel content ingestion queue is unavailable',
    );
  }
}
