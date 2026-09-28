import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Prisma } from '../../../generated/prisma/client';

/** The single error shape every endpoint returns. */
export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  path: string;
  timestamp: string;
}

/**
 * One filter for every failure, so a client never has to parse two error shapes
 * and an unexpected exception can never leak a stack trace or a SQL fragment.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const { status, code, message, details } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(request.id !== undefined ? { requestId: request.id } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();
      if (typeof payload === 'string') {
        return { status, code: codeFor(status), message: payload };
      }
      const record = payload as Record<string, unknown>;
      return {
        status,
        code: typeof record.code === 'string' ? record.code : codeFor(status),
        message:
          typeof record.message === 'string'
            ? record.message
            : Array.isArray(record.message)
              ? (record.message as string[]).join('; ')
              : exception.message,
        details: Array.isArray(record.message) ? record.message : record.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception);
    }

    // Anything unrecognised is a bug. Say so without describing the internals.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side.',
    };
  }

  private describePrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'ALREADY_EXISTS',
          message: 'That already exists.',
          details: error.meta,
        };
      case 'P2003':
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'Not found.',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: `DB_${error.code}`,
          message: 'The database rejected that request.',
        };
    }
  }
}

function codeFor(status: number): string {
  const names: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    402: 'PAYMENT_REQUIRED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE',
    429: 'RATE_LIMITED',
  };
  return names[status] ?? `HTTP_${status}`;
}
