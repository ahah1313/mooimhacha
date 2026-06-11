import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Decision } from '../entities/decision.entity';
import { ActionItem } from '../entities/action-item.entity';
import { Agenda } from '../entities/agenda.entity';
import { User } from '../entities/user.entity';
import { MeetingsModule } from '../meetings/meetings.module';
import { TeamsModule } from '../teams/teams.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Decision, ActionItem, Agenda, User]),
    MeetingsModule,
    TeamsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
