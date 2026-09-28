import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Stamps every request with an id, echoed in the response header and in every
 * log line and error body for that request. Without it, correlating a user's
 * report with a log entry is guesswork.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming !== '' ? incoming : randomUUID();
    req.id = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
