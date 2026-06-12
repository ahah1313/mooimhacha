import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamSettings } from '../entities/team-settings.entity';
import { ContributionController } from './contribution.controller';
import { ContributionService } from './contribution.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([TeamSettings]),
  ],
  controllers: [ContributionController],
  providers: [ContributionService],
})
export class ContributionModule {}
