import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class ProvinceNotFoundException extends DomainException {
  constructor(id: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(status, ErrorCode.PROVINCE_NOT_FOUND, `Province ${id} not found`);
  }
}
