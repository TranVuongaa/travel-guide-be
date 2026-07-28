import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash, verify } from 'argon2';

@Injectable()
export class PasswordHasherService {
  constructor(private readonly config: ConfigService) {}

  hash(value: string): Promise<string> {
    return hash(value, {
      type: argon2id,
      memoryCost: this.config.getOrThrow<number>('auth.argon2.memoryCost'),
      timeCost: this.config.getOrThrow<number>('auth.argon2.timeCost'),
      parallelism: this.config.getOrThrow<number>('auth.argon2.parallelism'),
    });
  }

  async verify(hashValue: string, plainValue: string): Promise<boolean> {
    try {
      return await verify(hashValue, plainValue);
    } catch {
      return false;
    }
  }
}
