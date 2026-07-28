import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class PostNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.POST_NOT_FOUND,
      `Post ${id} not found`,
    );
  }
}

export class ReviewNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.REVIEW_NOT_FOUND,
      `Review ${id} not found`,
    );
  }
}

export class CommentNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.COMMENT_NOT_FOUND,
      `Comment ${id} not found`,
    );
  }
}

export class ReactionNotFoundException extends DomainException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.REACTION_NOT_FOUND,
      'Reaction not found',
    );
  }
}

export class ReviewDuplicateException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.REVIEW_DUPLICATE,
      'A review for this place already exists',
    );
  }
}

export class ContentTargetNotFoundException extends DomainException {
  constructor() {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.CONTENT_TARGET_NOT_FOUND,
      'The published content target was not found',
    );
  }
}

export class CommentParentTargetMismatchException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.COMMENT_PARENT_TARGET_MISMATCH,
      'The parent comment belongs to a different target',
    );
  }
}

export class CommentMaxDepthException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.COMMENT_MAX_DEPTH,
      'Comments may be nested at most five levels',
    );
  }
}

export class ContentQueueUnavailableException extends DomainException {
  constructor() {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.CONTENT_QUEUE_UNAVAILABLE,
      'The content aggregate queue is unavailable',
    );
  }
}
