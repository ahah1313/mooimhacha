import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { ContributionScore } from '../entities/contribution-score.entity';
import { PresenceEvent } from '../entities/presence-event.entity';
import { MeetingAbsence } from '../entities/meeting-absence.entity';
import { AbsenceConsent } from '../entities/absence-consent.entity';
import { User } from '../entities/user.entity';
import { Team } from '../entities/team.entity';
import { TeamSettings } from '../entities/team-settings.entity';
import { TeamsModule } from '../teams/teams.module';
import { SlackModule } from '../slack/slack.module';
import { MeetingAbsencesController } from './meeting-absences.controller';
import { MeetingAbsencesService } from './meeting-absences.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Meeting,
      ContributionScore,
      PresenceEvent,
      MeetingAbsence,
      AbsenceConsent,
      User,
      Team,
      TeamSettings,
    ]),
    TeamsModule,
    forwardRef(() => SlackModule),
  ],
  controllers: [MeetingAbsencesController],
  providers: [MeetingAbsencesService],
  exports: [MeetingAbsencesService],
})
export class MeetingAbsencesModule {}
