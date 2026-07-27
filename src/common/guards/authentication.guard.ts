import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '../constants/error-code.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHENTICATED,
        message:
          'Authentication is required; the Auth module has not been implemented yet',
      });
    }

    return true;
  }
}
