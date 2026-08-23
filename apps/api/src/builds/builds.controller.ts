import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CreateBuildBody, BuildDetail, BuildSummary, Page, UpdateBuildBody } from 'aow5-api-contract';
import type { UserRow } from '../../core/db/users.ts';
import { CurrentUser } from '../auth/current-user.decorator.ts';
import { AuthGuard } from '../auth/session.guard.ts';
import { BuildsService } from './builds.service.ts';

/**
 * Thin on purpose: read the request, call into core/, map the answer onto a
 * status code. Anything here worth testing belongs one directory over.
 */
@Controller()
export class BuildsController {
  constructor(private readonly builds: BuildsService) {}

  @Get('builds')
  browse(@Query() query: Record<string, string | undefined>): Page<BuildSummary> {
    return this.builds.browse(query);
  }

  @Get('me/builds')
  @UseGuards(AuthGuard)
  mine(@CurrentUser() user: UserRow): BuildSummary[] {
    return this.builds.mine(user);
  }

  @Get('builds/:slug')
  get(@Param('slug') slug: string, @CurrentUser() user: UserRow | undefined): BuildDetail {
    return this.builds.get(slug, user);
  }

  /** Ten an hour: only five slots exist, so anything past that is a script. */
  @Post('builds')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  create(@Body() body: CreateBuildBody, @CurrentUser() user: UserRow): BuildDetail {
    return this.builds.create(body, user);
  }

  @Patch('builds/:slug')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  update(@Param('slug') slug: string, @Body() body: UpdateBuildBody, @CurrentUser() user: UserRow): BuildDetail {
    return this.builds.update(slug, body, user);
  }

  @Delete('builds/:slug')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  remove(@Param('slug') slug: string, @CurrentUser() user: UserRow): void {
    this.builds.remove(slug, user);
  }
}
