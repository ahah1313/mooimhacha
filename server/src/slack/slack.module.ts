import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from '../entities/team.entity';
import { TeamSettings } from '../entities/team-settings.entity';
import { User } from '../entities/user.entity';
import { MeetingAbsencesModule } from '../meeting-absences/meeting-absences.module';
import { TeamsModule } from '../teams/teams.module';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TeamSettings, User, Team]),
    forwardRef(() => MeetingAbsencesModule),
    TeamsModule,
  ],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
