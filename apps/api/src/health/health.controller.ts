import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_VERSION } from '../version.ts';

/**
 * What the compose healthcheck and `infra/deploy.sh` ask.
 *
 * Deliberately does not touch the database: a health check that fails when a
 * query is slow turns a slow query into an outage, because the orchestrator
 * restarts the container mid-request. This answers "is the process serving?".
 */
@Controller('health')
// Unthrottled for the same reason it does not touch the database: the compose
// healthcheck and deploy.sh both read this on a timer, and a 429 here is an
// orchestrator restarting a server that was fine.
@SkipThrottle()
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  get(): { ok: true; version: string; uptime: number } {
    return { ok: true, version: APP_VERSION, uptime: Math.floor((Date.now() - this.startedAt) / 1000) };
  }
}
