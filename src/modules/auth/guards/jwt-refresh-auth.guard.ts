import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { DomainException } from '../../../common/exceptions/domain.exception';
import { InvalidRefreshTokenException } from '../../../common/exceptions/identity.exceptions';
import { RefreshAuthUser } from '../../../common/interfaces/auth-user.interface';

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = RefreshAuthUser>(
    error: unknown,
    user: TUser | false | null,
  ): TUser {
    if (error instanceof DomainException) {
      throw error;
    }
    if (error || !user) {
      throw new InvalidRefreshTokenException();
    }

    return user;
  }
}
