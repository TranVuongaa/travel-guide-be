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

export class TravelContentIngestionNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.TRAVEL_INGESTION_NOT_FOUND,
      `Travel content ingestion run ${id} not found`,
    );
  }
}
