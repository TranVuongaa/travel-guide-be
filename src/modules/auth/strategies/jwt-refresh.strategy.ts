import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  AccountInactiveException,
  InvalidRefreshTokenException,
} from '../../../common/exceptions/identity.exceptions';
import { RefreshAuthUser } from '../../../common/interfaces/auth-user.interface';
import { UsersService } from '../../users/users.service';
import { RefreshTokenPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('auth.jwtRefreshSecret'),
      issuer: config.getOrThrow<string>('auth.jwtIssuer'),
      audience: config.getOrThrow<string>('auth.jwtAudience'),
    });
  }

  async validate(payload: RefreshTokenPayload): Promise<RefreshAuthUser> {
    if (!payload.sub || !payload.jti || payload.type !== 'refresh') {
      throw new InvalidRefreshTokenException();
    }

    const user = await this.usersService.findAuthUserById(payload.sub);
    if (!user) {
      throw new InvalidRefreshTokenException();
    }
    if (!user.isActive) {
      throw new AccountInactiveException();
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      refreshTokenId: payload.jti,
    };
  }
}
