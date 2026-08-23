/**
 * One failure shape for the whole API.
 *
 * Nest's own HttpException bodies differ per throw site; the site would then be
 * switching on message strings, which are translated and change. `code` is the
 * contract, `message` is for whoever is reading a network tab.
 */
import { HttpException } from '@nestjs/common';
import type { ApiErrorCode } from 'aow5-api-contract';

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GONE: 410,
  BUILD_LIMIT_REACHED: 409,
  RATE_LIMITED: 429,
  DUPLICATE_COMMENT: 409,
  SELF_VOTE: 403,
  PAYLOAD_INVALID: 422,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_CREDENTIALS: 401,
  NICKNAME_TAKEN: 409,
  CAPTCHA_FAILED: 400,
  INTERNAL: 500,
};

export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super({ error: { code, message, ...(fields ? { fields } : {}) } }, STATUS[code]);
  }
}
