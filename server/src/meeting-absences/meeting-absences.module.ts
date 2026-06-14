import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from '../entities/meeting.entity';
import { ContributionScore } from '../entities/contribution-score.entity';
import { PresenceEvent } from '../entities/presence-event.entity';
import { MeetingAbsence } from '../entities/meeting-absence.entity';
import { AbsenceConsent } from '../entities/absence-consent.entity';
import { TeamsModule } from '../teams/teams.module';
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
    ]),
    TeamsModule,
  ],
  controllers: [MeetingAbsencesController],
  providers: [MeetingAbsencesService],
  exports: [MeetingAbsencesService],
})
export class MeetingAbsencesModule {}
