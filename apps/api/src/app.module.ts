import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.ts';
import { DbModule } from './db/db.module.ts';
import { BuildsModule } from './builds/builds.module.ts';
import { HealthModule } from './health/health.module.ts';
import { SocialModule } from './social/social.module.ts';
import { SoundsModule } from './sounds/sounds.module.ts';
import { AllExceptionsFilter } from './http/all-exceptions.filter.ts';
import { OriginGuard } from './auth/origin.guard.ts';
import { SessionGuard } from './auth/session.guard.ts';
import { ScopedThrottlerGuard, THROTTLE_DEFAULTS } from './throttle.ts';

@Module({
  imports: [ThrottlerModule.forRoot(THROTTLE_DEFAULTS), DbModule, HealthModule, AuthModule, BuildsModule, SocialModule, SoundsModule],
  // A provider rather than `app.useGlobalFilters`, so the filter can be
  // constructed by DI when it eventually needs something injected.
  //
  // It covers everything a controller throws, which is every error the site can
  // actually receive. It does NOT cover the 404 Nest raises for a path matching
  // no controller at all — that one is emitted by the adapter, before the filter
  // chain exists. Nothing calls a route that is not there, so it is left alone
  // rather than papered over with a catch-all that would shadow real routes as
  // more modules are added.
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global, and in this order: every request gets a user resolved from its
    // cookie (or stays anonymous), and every mutating request must come from
    // this site. Routes that additionally *require* a user opt in with
    // `@UseGuards(AuthGuard)`.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    // Last, so it counts a request that was going to be served. It reads
    // `request.user`, which SessionGuard put there — order is load-bearing.
    { provide: APP_GUARD, useClass: ScopedThrottlerGuard },
  ],
})
export class AppModule {}
