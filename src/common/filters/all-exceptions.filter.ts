import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ErrorCode } from '../constants/error-code.enum';

interface ExceptionBody {
  errorCode?: string;
  message?: string | string[];
  details?: unknown[];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.getExceptionBody(exception);
    const validationMessages = Array.isArray(body.message) ? body.message : [];
    const message = Array.isArray(body.message)
      ? 'Request validation failed'
      : (body.message ?? 'Internal server error');

    response.status(status).json({
      success: false,
      error: {
        code:
          body.errorCode ??
          (status === 500 ? ErrorCode.INTERNAL_SERVER_ERROR : `HTTP_${status}`),
        message,
        details:
          body.details ?? validationMessages.map((item) => ({ message: item })),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: request.requestId,
      },
    });
  }

  private getExceptionBody(exception: unknown): ExceptionBody {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { message: response };
    }

    return response;
  }
}
