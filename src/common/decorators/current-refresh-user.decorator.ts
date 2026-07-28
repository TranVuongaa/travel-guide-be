import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { RefreshAuthUser } from '../interfaces/auth-user.interface';

export const CurrentRefreshUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RefreshAuthUser => {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: RefreshAuthUser }>();

    if (!request.user) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.INVALID_REFRESH_TOKEN,
        message: 'A valid refresh token is required',
      });
    }

    return request.user;
  },
);
