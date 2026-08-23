import { Module } from '@nestjs/common';
import { SocialController } from './social.controller.ts';
import { SocialService } from './social.service.ts';

@Module({ controllers: [SocialController], providers: [SocialService], exports: [SocialService] })
export class SocialModule {}
