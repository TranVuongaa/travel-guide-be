import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';

export class DomainException extends HttpException {
  constructor(
    status: HttpStatus,
    errorCode: ErrorCode,
    message: string,
    details: unknown[] = [],
  ) {
    super({ errorCode, message, details }, status);
  }
}
