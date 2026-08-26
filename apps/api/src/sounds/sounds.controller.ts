import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { SoundSearchResponse } from 'aow5-api-contract';
import { FreesoundService } from './freesound.service.ts';

/**
 * Sound search, for the tracker's picker.
 *
 * The one route on this API that is not about the site. It is here because the
 * tracker cannot hold the catalogue's key — see `FreesoundService` — and not
 * because sounds have anything to do with builds.
 *
 * No `@UseGuards(AuthGuard)`: the tracker has no account on this site and
 * should not need one to hear what a coin sounds like. That makes the throttle
 * below the only thing standing between one enthusiastic player and this
 * server's daily quota, which is why it is tighter than the default floor.
 */
@Controller('sounds')
export class SoundsController {
  constructor(private readonly freesound: FreesoundService) {}

  /**
   * A page of hits, or an error the picker can render as a sentence.
   *
   * Thirty a minute is a person typing and re-typing a query, and nowhere near
   * a script walking the catalogue. The cache in the service means most of
   * these never leave this machine.
   */
  @Get('search')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  search(@Query('q') q: string | undefined, @Query('page') page: string | undefined): Promise<SoundSearchResponse> {
    return this.freesound.search(q ?? '', Number(page ?? '1'));
  }

  /**
   * Whether this deployment can search at all.
   *
   * Asked once when the picker opens, so a tracker pointed at a server with no
   * key says so instead of offering a search box that will only ever answer
   * with an error.
   */
  @Get('status')
  status(): { configured: boolean } {
    return { configured: this.freesound.configured };
  }
}
