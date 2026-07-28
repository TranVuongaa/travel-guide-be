import { Injectable } from '@nestjs/common';
import type { JWTPayload } from 'jose';

@Injectable()
export class OidcCryptoService {
  async verifyGoogle(idToken: string, audience: string): Promise<JWTPayload> {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(
      new URL('https://www.googleapis.com/oauth2/v3/certs'),
    );
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
      algorithms: ['RS256'],
    });
    return payload;
  }

  async verifyApple(idToken: string, audience: string): Promise<JWTPayload> {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(
      new URL('https://appleid.apple.com/auth/keys'),
    );
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: 'https://appleid.apple.com',
      audience,
      algorithms: ['RS256'],
    });
    return payload;
  }

  async createAppleClientSecret(options: {
    privateKey: string;
    keyId: string;
    teamId: string;
    clientId: string;
  }): Promise<string> {
    const { importPKCS8, SignJWT } = await import('jose');
    const key = await importPKCS8(options.privateKey, 'ES256');

    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: options.keyId })
      .setIssuer(options.teamId)
      .setSubject(options.clientId)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  }
}
