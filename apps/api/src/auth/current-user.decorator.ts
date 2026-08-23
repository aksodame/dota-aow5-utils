import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { UserRow } from '../../core/db/users.ts';
import type { AuthedRequest } from './session.guard.ts';

/** The signed-in user, or undefined. Pair with AuthGuard when it must be there. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): UserRow | undefined => {
  return context.switchToHttp().getRequest<AuthedRequest>().user;
});
