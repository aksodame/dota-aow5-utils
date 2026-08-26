import { Module } from '@nestjs/common';
import { SoundsController } from './sounds.controller.ts';
import { FreesoundService } from './freesound.service.ts';

@Module({ controllers: [SoundsController], providers: [FreesoundService] })
export class SoundsModule {}
