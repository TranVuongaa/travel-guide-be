import { randomUUID } from 'node:crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestIdHeader = request.headers['x-request-id'];
    const requestId =
      typeof requestIdHeader === 'string' ? requestIdHeader : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
