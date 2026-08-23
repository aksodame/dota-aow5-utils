import { Module } from '@nestjs/common';
import { BuildsController } from './builds.controller.ts';
import { BuildsService } from './builds.service.ts';

@Module({ controllers: [BuildsController], providers: [BuildsService], exports: [BuildsService] })
export class BuildsModule {}
