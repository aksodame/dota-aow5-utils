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
import type { CommentDto, CreateCommentBody, Page, VoteBody } from 'aow5-api-contract';
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
   * PUT, because a vote is a value being set rather than an event being
   * appended — sending the same one twice has to mean the same thing as
   * sending it once.
   */
  @Put('builds/:slug/vote')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 3_600_000, limit: 60 } })
  vote(
    @Param('slug') slug: string,
    @Body() body: VoteBody,
    @CurrentUser() user: UserRow,
  ): { value: number; likeCount: number; dislikeCount: number } {
    return this.social.vote(slug, body?.value, user);
  }
}
