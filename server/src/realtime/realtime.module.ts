import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { Utterance } from '../entities/utterance.entity';
import { PresenceEvent } from '../entities/presence-event.entity';
import { Meeting } from '../entities/meeting.entity';
import { AnomalyEvent } from '../entities/anomaly-event.entity';
import { MeetingsModule } from '../meetings/meetings.module';
import { AgendasModule } from '../agendas/agendas.module';
import { DecisionsModule } from '../decisions/decisions.module';
import { ActionItemsModule } from '../action-items/action-items.module';
import { RealtimeGateway } from './realtime.gateway';
import { MeetingStateService } from './meeting-state.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Utterance, PresenceEvent, Meeting, AnomalyEvent]),
    JwtModule.register({}),
    ConfigModule,
    MeetingsModule,
    AgendasModule,
    DecisionsModule,
    ActionItemsModule,
  ],
  providers: [RealtimeGateway, MeetingStateService],
})
export class RealtimeModule {}
