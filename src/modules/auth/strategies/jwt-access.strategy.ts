import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  AccountInactiveException,
  InvalidAccessTokenException,
} from '../../../common/exceptions/identity.exceptions';
import { AuthUser } from '../../../common/interfaces/auth-user.interface';
import { UsersService } from '../../users/users.service';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('auth.jwtAccessSecret'),
      issuer: config.getOrThrow<string>('auth.jwtIssuer'),
      audience: config.getOrThrow<string>('auth.jwtAudience'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    if (!payload.sub || payload.type !== 'access') {
      throw new InvalidAccessTokenException();
    }

    const user = await this.usersService.findAuthUserById(payload.sub);
    if (!user) {
      throw new InvalidAccessTokenException();
    }
    if (!user.isActive) {
      throw new AccountInactiveException();
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}
