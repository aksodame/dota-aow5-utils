/**
 * Makes every escaping error look like an ApiError.
 *
 * Without this a Nest 404 is `{statusCode, message}` and an ApiException is
 * `{error:{...}}`, and the site has to handle both. An unrecognised throw
 * becomes a 500 with no detail — whatever it was said, it was not written to be
 * read by a stranger.
 */
import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from 'aow5-api-contract';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const status = exception.getStatus();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        response.status(status).json(body as ApiError);
        return;
      }
      const message = typeof body === 'string' ? body : ((body as { message?: unknown }).message ?? 'Request failed');
      response.status(status).json({
        error: { code: status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message: String(message) },
      } satisfies ApiError);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(500).json({
      error: { code: 'INTERNAL', message: 'Something went wrong.' },
    } satisfies ApiError);
  }
}
