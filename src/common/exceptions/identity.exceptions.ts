import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { DomainException } from './domain.exception';

export class EmailAlreadyRegisteredException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.EMAIL_ALREADY_REGISTERED,
      'An account with this email already exists',
    );
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.INVALID_CREDENTIALS,
      'Email or password is invalid',
    );
  }
}

export class InvalidAccessTokenException extends DomainException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.INVALID_ACCESS_TOKEN,
      'Access token is invalid or expired',
    );
  }
}

export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      ErrorCode.INVALID_REFRESH_TOKEN,
      'Refresh token is invalid or expired',
    );
  }
}

export class AccountInactiveException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      ErrorCode.ACCOUNT_INACTIVE,
      'This account is inactive',
    );
  }
}

export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(
      HttpStatus.NOT_FOUND,
      ErrorCode.USER_NOT_FOUND,
      `User ${id} not found`,
    );
  }
}

export class CurrentPasswordIncorrectException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.CURRENT_PASSWORD_INCORRECT,
      'Current password is incorrect',
    );
  }
}

export class PasswordUnchangedException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.PASSWORD_UNCHANGED,
      'New password must be different from the current password',
    );
  }
}

export class SelfRoleChangeForbiddenException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      ErrorCode.SELF_ROLE_CHANGE_FORBIDDEN,
      'Administrators cannot change their own role',
    );
  }
}

export class SelfDeactivationForbiddenException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      ErrorCode.SELF_DEACTIVATION_FORBIDDEN,
      'Administrators cannot deactivate their own account',
    );
  }
}

export class ForbiddenDomainException extends DomainException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'You do not have permission to perform this action',
    );
  }
}

export class OAuthProviderException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_GATEWAY,
      ErrorCode.OAUTH_PROVIDER_ERROR,
      'The identity provider could not authenticate this request',
    );
  }
}

export class OAuthEmailRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.BAD_REQUEST,
      ErrorCode.OAUTH_EMAIL_REQUIRED,
      'The identity provider must return a verified email',
    );
  }
}

export class OAuthAccountConflictException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.OAUTH_ACCOUNT_CONFLICT,
      'This social identity is already linked to another account',
    );
  }
}

export class AccountLinkRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.ACCOUNT_LINK_REQUIRED,
      'Sign in to the existing account before linking this provider',
    );
  }
}

export class LastLoginMethodRequiredException extends DomainException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      ErrorCode.LAST_LOGIN_METHOD_REQUIRED,
      'At least one login method must remain linked to the account',
    );
  }
}
