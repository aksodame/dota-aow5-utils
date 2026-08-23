import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { loadConfig } from './config.ts';
import { APP_VERSION } from './version.ts';

async function bootstrap(): Promise<INestApplication> {
  const config = loadConfig();
  // bodyParser off here so the only one installed is the one below, with the
  // limit this API actually wants rather than Nest's 100 kB default.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  // Every path is under /api, because Caddy routes on that prefix and the SPA
  // owns everything else. See infra/Caddyfile.
  app.setGlobalPrefix('api');

  /**
   * Every request arrives from Caddy on the compose network, so without this
   * `req.ip` is the proxy for all of them — one rate-limit bucket for the whole
   * internet. `1` and not `true`: trusting an arbitrary number of hops lets a
   * client forge X-Forwarded-For and pick its own bucket.
   */
  app.set('trust proxy', 1);

  /**
   * A board is a few hundred bytes and a comment is capped at two thousand
   * characters, so nothing legitimate comes close to this. It is here so the
   * process never has to hold a megabyte of JSON to find out it did not want it.
   */
  app.useBodyParser('json', { limit: '32kb' });
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  new Logger('bootstrap').log(`aow5-utils-api ${APP_VERSION} listening on :${config.port}`);
  return app;
}

void bootstrap();
