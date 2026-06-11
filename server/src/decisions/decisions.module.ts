import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Decision } from '../entities/decision.entity';
import { Meeting } from '../entities/meeting.entity';
import { TeamsModule } from '../teams/teams.module';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Decision, Meeting]), TeamsModule],
  controllers: [DecisionsController],
  providers: [DecisionsService],
  exports: [DecisionsService],
})
export class DecisionsModule {}
