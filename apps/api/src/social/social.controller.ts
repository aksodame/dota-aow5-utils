import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CommentDto,
  CreateCommentBody,
  LikeBody,
  LikeResponse,
  Page,
  PendingCommentDto,
} from 'aow5-api-contract';
import type { UserRow } from '../../core/db/users.ts';
import { CurrentUser } from '../auth/current-user.decorator.ts';
import { AuthGuard } from '../auth/session.guard.ts';
import { SocialService } from './social.service.ts';

@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('builds/:slug/comments')
  list(
    @Param('slug') slug: string,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() user: UserRow | undefined,
  ): Page<CommentDto> {
    return this.social.comments(slug, cursor, user);
  }

  /**
   * Five in ten minutes, on top of the fifteen-second gap and the
   * no-duplicates rule in the service.
   *
   * Between them these make a comment thread tedious to flood and unremarkable
   * to take part in, which is the right way round.
   */
  @Post('builds/:slug/comments')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 600_000, limit: 5 } })
  add(
    @Param('slug') slug: string,
    @Body() body: CreateCommentBody,
    @CurrentUser() user: UserRow,
  ): CommentDto {
    return this.social.addComment(slug, body?.body, user);
  }

  /**
   * The moderation queue. Declared before `comments/:id` so the literal wins
   * the route match — Express takes the first that fits, and `pending` would
   * otherwise be parsed as an id.
   */
  @Get('comments/pending')
  @UseGuards(AuthGuard)
  pending(@CurrentUser() user: UserRow): PendingCommentDto[] {
    return this.social.pending(user);
  }

  @Post('comments/:id/approve')
  @UseGuards(AuthGuard)
  // 200, not Nest's default 201: a verdict on an existing comment creates
  // nothing, and approving an approved one is deliberately a no-op.
  @HttpCode(200)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserRow): CommentDto {
    return this.social.approve(id, user);
  }

  @Patch('comments/:id')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  edit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateCommentBody,
    @CurrentUser() user: UserRow,
  ): CommentDto {
    return this.social.editComment(id, body?.body, user);
  }

  @Delete('comments/:id')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  @Throttle({ default: { ttl: 3_600_000, limit: 30 } })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserRow): void {
    this.social.removeComment(id, user);
  }

  /**
   * PUT, because a like is a value being set rather than an event being
   * appended — sending the same one twice has to mean the same thing as
   * sending it once.
   */
  @Put('builds/:slug/like')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  like(
    @Param('slug') slug: string,
    @Body() body: LikeBody,
    @CurrentUser() user: UserRow,
  ): LikeResponse {
    return this.social.like(slug, body?.liked, user);
  }
}
