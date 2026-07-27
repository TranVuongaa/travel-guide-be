import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { ErrorCode } from '../constants/error-code.enum';
import { AuthUser } from '../interfaces/auth-user.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    if (!request.user) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHENTICATED,
        message: 'Authentication is required',
      });
    }

    return request.user;
  },
);
