import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class ProvinceAlreadyExistsException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.PROVINCE_ALREADY_EXISTS,
      `Province ${name} already exists`,
    );
  }
}

export class CategoryAlreadyExistsException extends DomainException {
  constructor(name: string) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.CATEGORY_ALREADY_EXISTS,
      `Category ${name} already exists`,
    );
  }
}

export class ProvinceInUseException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.PROVINCE_IN_USE,
      `Province ${id} is referenced by one or more places`,
    );
  }
}

export class ReferenceNameRequiredException extends DomainException {
  constructor(entity: 'category' | 'province') {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.REFERENCE_NAME_REQUIRED,
      `A name is required to update a ${entity}`,
    );
  }
}
