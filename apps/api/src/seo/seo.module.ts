import { Module } from '@nestjs/common';
import { CONFIG, loadConfig, type AppConfig } from '../config.ts';
import { CardService } from './card.service.ts';
import { SeoController } from './seo.controller.ts';
import { SeoService } from './seo.service.ts';

/**
 * The half of the site that exists for machines.
 *
 * Named `seo` rather than `social` because `social` is already taken by
 * comments and likes — which is the other, entirely unrelated sense of the
 * word in this codebase.
 *
 * The config is a provider here rather than a `loadConfig()` call inside each
 * service, which is what the rest of the app does. The difference is that these
 * two read *paths* out of it — where the icons are, where to cache a rendered
 * card — and a test that wants to point them somewhere else should be able to
 * override one token instead of setting environment variables around an import.
 * `CONFIG` has been declared in config.ts for this since before there was
 * anything to inject it into.
 */
@Module({
  controllers: [SeoController],
  providers: [{ provide: CONFIG, useFactory: (): AppConfig => loadConfig() }, SeoService, CardService],
  exports: [SeoService],
})
export class SeoModule {}
