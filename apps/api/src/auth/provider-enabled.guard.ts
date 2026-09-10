import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { loadConfig } from '../config.ts';

/**
 * Refuses the Discord routes when the deployment has no Discord application.
 *
 * Without this the routes still exist, Passport is asked for a strategy that
 * was never registered, and the visitor gets a 500 — which says "this server is
 * broken" about a door that simply is not here. A 404 is the honest answer, and
 * it matches what `GET /auth/providers` already tells the sign-in screen.
 *
 * A guard rather than a check inside the handler, because `AuthGuard('discord')`
 * runs before any handler body and is exactly the thing that would throw.
 * Guards run in declaration order, so this one goes first.
 */
@Injectable()
export class DiscordEnabledGuard implements CanActivate {
  private readonly enabled = loadConfig().discord !== null;

  canActivate(): boolean {
    if (!this.enabled) throw new NotFoundException('Discord sign-in is not configured here.');
    return true;
  }
}
