import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { Utterance } from '../entities/utterance.entity';
import { PresenceEvent } from '../entities/presence-event.entity';
import { Meeting } from '../entities/meeting.entity';
import { AnomalyEvent } from '../entities/anomaly-event.entity';
import { MeetingsService } from '../meetings/meetings.service';
import { AgendasService } from '../agendas/agendas.service';
import { DecisionsService } from '../decisions/decisions.service';
import { ActionItemsService } from '../action-items/action-items.service';
import { MeetingStateService } from './meeting-state.service';
import { MeetingEvents } from '../events/meeting-events';

interface JoinPayload {
  meeting_id: number;
}
interface UtterancePayload {
  meeting_id: number;
  text: string;
  char_count: number;
  started_at_offset_ms: number;
  ended_at_offset_ms: number;
  confidence?: number | null;
}
interface AgendaStatusPayload {
  meeting_id: number;
  agenda_id: number;
  status?: 'pending' | 'active' | 'done';
  activate?: boolean;
}
interface DecisionPayload {
  meeting_id: number;
  content: string;
  agenda_id?: number;
}
interface ActionPayload {
  meeting_id: number;
  team_id: number;
  description: string;
  assignee_id?: number;
  due_date?: string;
  difficulty?: number;
  agenda_id?: number;
  is_for_next_meeting?: boolean;
}
interface AnomalyPayload {
  meeting_id: number;
  event_type: 'capture_loss' | 'inference_fail' | 'stt_failure';
  timestamp_offset_ms?: number;
  severity?: string;
  metadata?: Record<string, unknown>;
}

// socket.data 는 기본 any 이므로 명시적 타입을 부여한다.
interface SocketData {
  userId?: number;
  meetingId?: number;
}
function dataOf(client: Socket): SocketData {
  return client.data as SocketData;
}

function room(meetingId: number): string {
  return `meeting:${meetingId}`;
}

// 데코레이터는 import 시점에 평가되므로 ConfigService 대신 process.env 직접 참조 (정적 폴백 필수).
// origin 콜백: 패키징 Electron(file:// 로드)은 Origin이 'null', 서버 간 호출은 Origin 부재라
// 화이트리스트 배열로는 차단되므로 둘은 허용하고 그 외만 화이트리스트 검사한다.
@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowList = [
        process.env.CLIENT_ORIGIN,
        'http://localhost:5173',
      ].filter((o): o is string => !!o);
      cb(null, !origin || origin === 'null' || allowList.includes(origin));
    },
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private meetingsService: MeetingsService,
    private agendasService: AgendasService,
    private decisionsService: DecisionsService,
    private actionItemsService: ActionItemsService,
    private state: MeetingStateService,
    private meetingEvents: MeetingEvents,
    @InjectRepository(Utterance)
    private utteranceRepo: Repository<Utterance>,
    @InjectRepository(PresenceEvent)
    private presenceRepo: Repository<PresenceEvent>,
    @InjectRepository(Meeting)
    private meetingRepo: Repository<Meeting>,
    @InjectRepository(AnomalyEvent)
    private anomalyRepo: Repository<AnomalyEvent>,
  ) {}

  // 게이트웨이 초기화 시 도메인 이벤트 구독 — 회의 start(T0 발행) 시 룸 전체 broadcast
  afterInit() {
    this.meetingEvents.onT0((payload) => {
      // TypeORM bigint id는 런타임에 string일 수 있으므로 emit 전에 number로 정규화
      const meetingId = Number(payload.meeting_id);
      this.server.to(room(meetingId)).emit('meeting:t0', {
        meeting_id: meetingId,
        t0_timestamp: payload.t0_timestamp,
        status: payload.status,
      });
    });
    // 회의 종료 → 룸 전체에 알리고 인메모리 기여도 상태 정리
    this.meetingEvents.onEnded((payload) => {
      const meetingId = Number(payload.meeting_id);
      this.server
        .to(room(meetingId))
        .emit('meeting:ended', { meeting_id: meetingId });
      this.state.clear(meetingId);
      this.rehydratedMeetings.delete(meetingId);
    });
  }

  // --- 연결 인증 (JWT) ---
  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) throw new Error('no token');
      const payload = this.jwtService.verify<{ sub: number; type?: string }>(
        token,
        { secret: this.config.get<string>('JWT_SECRET') },
      );
      if (payload.type === 'refresh') throw new Error('refresh token');
      dataOf(client).userId = payload.sub;
    } catch {
      this.logger.warn(`인증 실패 소켓 연결 차단: ${client.id}`);
      client.emit('error', { message: '인증에 실패했습니다.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const { meetingId, userId } = dataOf(client);
    if (meetingId && userId) {
      void this.recordPresence(meetingId, userId, 'disconnect', 'involuntary');
    }
  }

  private userId(client: Socket): number {
    return dataOf(client).userId as number;
  }

  // 참가자 권한 + 회의 진행 상태 동시 확인 (종료된 회의에 쓰기 차단)
  private async assertActiveParticipant(userId: number, meetingId: number) {
    const meeting = await this.meetingsService.assertParticipant(
      userId,
      meetingId,
    );
    if (meeting.status === 'ended') {
      throw new WsException('이미 종료된 회의예요.');
    }
    return meeting;
  }

  // --- 회의 룸 입장 ---
  @SubscribeMessage('meeting:join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    const meeting = await this.meetingsService.assertParticipant(
      userId,
      meetingId,
    );
    await client.join(room(meetingId));
    dataOf(client).meetingId = meetingId;
    // 서버 재시작 후 첫 입장이면 utterances에서 누적 글자수 복원
    // (라이브 기여도 바 0 리셋 방지 — ensureParticipant보다 먼저 수행해야 함).
    // 완료 여부는 charCounts 엔트리가 아닌 별도 Set으로 추적 — addChars가 엔트리를
    // 즉석 생성하므로 has()는 재수화 완료 신호가 아니다.
    if (
      !this.rehydratedMeetings.has(meetingId) &&
      meeting.status === 'active'
    ) {
      await this.rehydrateState(meetingId);
    }
    this.state.ensureParticipant(meetingId, userId);
    await this.recordPresence(meetingId, userId, 'join');

    // 시각 동기화 기준점 전달
    client.emit('meeting:t0', {
      meeting_id: Number(meeting.id),
      t0_timestamp: meeting.t0_timestamp,
      status: meeting.status,
    });
    // 입장 알림 + 현재 기여도 스냅샷
    this.server.to(room(meetingId)).emit('presence:update', {
      meeting_id: meetingId,
      user_id: userId,
      event: 'join',
    });
    this.broadcastContribution(meetingId);
    return { ok: true };
  }

  @SubscribeMessage('meeting:leave')
  async onLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    await this.meetingsService.assertParticipant(userId, meetingId);
    await client.leave(room(meetingId));
    await this.recordPresence(meetingId, userId, 'leave', 'voluntary');
    // 퇴장 후 disconnect가 유령 퇴장 기록을 남기지 않도록 정리
    if (dataOf(client).meetingId === meetingId) {
      dataOf(client).meetingId = undefined;
    }
    this.server.to(room(meetingId)).emit('presence:update', {
      meeting_id: meetingId,
      user_id: userId,
      event: 'leave',
    });
    return { ok: true };
  }

  // --- 확정 발화 수신 ---
  @SubscribeMessage('utterance:new')
  async onUtterance(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: UtterancePayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    const meeting = await this.assertActiveParticipant(userId, meetingId);

    // 재연결 시 버퍼된 utterance가 join보다 먼저 도착할 수 있으므로(socket.io가
    // 'connect' 이벤트 전에 sendBuffer를 비움) 이 경로에서도 재수화를 보장한다.
    // 반드시 INSERT·addChars 전에 대기 — INSERT가 seed SELECT에 섞이면 이중 카운트,
    // addChars가 seed보다 먼저면 절대값 덮어쓰기로 누락이 생기기 때문.
    if (
      meeting.status === 'active' &&
      !this.rehydratedMeetings.has(meetingId)
    ) {
      await this.rehydrateState(meetingId);
    }

    // 클라이언트 값은 신뢰하지 않는다 — char_count는 서버가 text 길이로 강제 산출(조작 방지),
    // 과대 텍스트는 거부 대신 절단(발화 유실 방지), 오프셋·confidence는 클램프.
    const text = (typeof body.text === 'string' ? body.text : '').slice(
      0,
      2000,
    );
    const charCount = text.length;
    const startedAt = Math.max(0, Number(body.started_at_offset_ms) || 0);
    const endedAt = Math.max(
      startedAt,
      Math.max(0, Number(body.ended_at_offset_ms) || 0),
    );
    const confidence =
      body.confidence == null || Number.isNaN(Number(body.confidence))
        ? null
        : Math.min(1, Math.max(0, Number(body.confidence)));

    // ★ 발화 시작 오프셋 기준으로 안건에 자동 매핑
    const agendaId = await this.agendasService.getActiveAgendaId(
      meetingId,
      startedAt,
    );

    // 발화 원본은 즉시 RDS 저장 (텍스트만, 음성 미저장)
    const saved = await this.utteranceRepo.save(
      this.utteranceRepo.create({
        meeting_id: meetingId,
        user_id: userId,
        text,
        char_count: charCount,
        confidence,
        started_at_offset_ms: startedAt,
        ended_at_offset_ms: endedAt,
        agenda_id: agendaId,
      }),
    );

    // 인메모리 누적 + 1초 디바운스 broadcast
    this.state.addChars(meetingId, userId, charCount);
    this.state.scheduleBroadcast(meetingId, () =>
      this.broadcastContribution(meetingId),
    );

    return {
      utterance_id: Number(saved.id),
      agenda_id: agendaId == null ? null : Number(agendaId),
    };
  }

  // --- 안건 상태 변경 (양방향) ---
  @SubscribeMessage('agenda:status-change')
  async onAgendaStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: AgendaStatusPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    await this.assertActiveParticipant(userId, meetingId);
    const agenda = body.activate
      ? await this.agendasService.activate(userId, body.agenda_id)
      : await this.agendasService.setStatus(
          userId,
          body.agenda_id,
          body.status ?? 'active',
        );
    // TypeORM bigint는 런타임에 string("7")일 수 있어 strict 비교 전 number 정규화 필수
    if (Number(agenda.meeting_id) !== meetingId) {
      throw new WsException('안건이 회의와 일치하지 않아요.');
    }
    this.server
      .to(room(meetingId))
      .emit('agenda:status-change', { meeting_id: meetingId, agenda });

    // 안건이 완료되면 LLM 요약을 비동기로 산출해 broadcast
    if (agenda.status === 'done') {
      void this.summarizeAndBroadcast(userId, meetingId, Number(agenda.id));
    }
    return { ok: true, agenda };
  }

  private async summarizeAndBroadcast(
    userId: number,
    meetingId: number,
    agendaId: number,
  ) {
    try {
      const { summary } = await this.agendasService.summarize(userId, agendaId);
      if (summary) {
        this.server
          .to(room(meetingId))
          .emit('agenda:summary', { agenda_id: agendaId, summary });
      }
    } catch (e) {
      this.logger.error('안건 요약 실패', e as Error);
    }
  }

  // --- 결정·액션 빠른 입력 (양방향) ---
  @SubscribeMessage('decision:new')
  async onDecision(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: DecisionPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    await this.assertActiveParticipant(userId, meetingId);
    const agendaId =
      body.agenda_id ??
      (await this.agendasService.getActiveAgendaId(meetingId)) ??
      undefined;
    const decision = await this.decisionsService.create(userId, {
      meeting_id: meetingId,
      content: body.content,
      agenda_id: agendaId,
    });
    this.server
      .to(room(meetingId))
      .emit('decision:new', { meeting_id: meetingId, decision });
    return { ok: true, decision };
  }

  @SubscribeMessage('action:new')
  async onAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ActionPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    const teamId = Number(body.team_id);
    const meeting = await this.assertActiveParticipant(userId, meetingId);
    // TypeORM bigint는 런타임에 string("7")일 수 있어 strict 비교 전 number 정규화 필수
    if (Number(meeting.team_id) !== teamId) {
      throw new WsException('회의와 팀이 일치하지 않아요.');
    }
    const agendaId =
      body.agenda_id ??
      (await this.agendasService.getActiveAgendaId(meetingId)) ??
      undefined;
    const action = await this.actionItemsService.create(userId, {
      team_id: teamId,
      description: body.description,
      assignee_id: body.assignee_id,
      due_date: body.due_date,
      difficulty: body.difficulty,
      agenda_id: agendaId,
      is_for_next_meeting: body.is_for_next_meeting,
    });
    this.server
      .to(room(meetingId))
      .emit('action:new', { meeting_id: meetingId, action });
    return { ok: true, action };
  }

  // --- 발화 중 표시 (양방향 relay) ---
  // 비팀원 소켓의 룸 주입 차단 — 클라이언트는 ack 없이 emit하므로 예외 노출 무해
  @SubscribeMessage('user:speaking-start')
  async onSpeakingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    await this.meetingsService.assertParticipant(userId, meetingId);
    this.server.to(room(meetingId)).emit('user:speaking-start', {
      meeting_id: meetingId,
      user_id: userId,
    });
  }

  @SubscribeMessage('user:speaking-end')
  async onSpeakingEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: JoinPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    await this.meetingsService.assertParticipant(userId, meetingId);
    this.server.to(room(meetingId)).emit('user:speaking-end', {
      meeting_id: meetingId,
      user_id: userId,
    });
  }

  // --- STT 실패·캡처 손실 보고 → anomaly_events 기록 (기여도 신뢰도 보정 입력) ---
  @SubscribeMessage('anomaly:report')
  async onAnomaly(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: AnomalyPayload,
  ) {
    const userId = this.userId(client);
    const meetingId = Number(body.meeting_id);
    // 정상 동작 잡음(침묵 no-speech, 인식 재시작 aborted)은 신뢰도 보정 입력을
    // 오염시키므로 기록하지 않는다 — 조용히 경청한 사람이 'low' 라벨을 받는 문제 방지.
    const reason = body.metadata?.reason;
    if (reason === 'no-speech' || reason === 'aborted') {
      return { ok: true };
    }
    // 종료된 회의에 쓰기 차단 (assertActiveParticipant가 meeting도 반환)
    const meeting = await this.assertActiveParticipant(userId, meetingId);
    const offset =
      body.timestamp_offset_ms ??
      (meeting.t0_timestamp ? Date.now() - meeting.t0_timestamp.getTime() : 0);
    await this.anomalyRepo.save(
      this.anomalyRepo.create({
        meeting_id: meetingId,
        user_id: userId,
        event_type: body.event_type,
        timestamp_offset_ms: offset,
        severity: body.severity ?? null,
        metadata: body.metadata ?? null,
      }),
    );
    return { ok: true };
  }

  // --- 내부 헬퍼 ---
  // 재수화 동시 호출 가드 (meetingId → in-flight Promise, 회의당 1회만 SELECT)
  private readonly rehydrations = new Map<number, Promise<void>>();
  // 재수화 완료 회의 — 회의 종료(clear) 시 함께 제거
  private readonly rehydratedMeetings = new Set<number>();

  // 서버 재시작 후 첫 join/utterance 시 utterances 집계로 인메모리 누적 글자수를 복원한다.
  // 절대값 set 시맨틱(seed)이므로 동시 호출 2건이 모두 타도 멱등.
  private rehydrateState(meetingId: number): Promise<void> {
    let inflight = this.rehydrations.get(meetingId);
    if (!inflight) {
      inflight = this.utteranceRepo
        .createQueryBuilder('u')
        .select('u.user_id', 'user_id')
        .addSelect('SUM(u.char_count)', 'char_count')
        .where('u.meeting_id = :meetingId', { meetingId })
        .groupBy('u.user_id')
        // bigNumberStrings: false 라 bigint·SUM 집계가 number로 오지만, 안전 범위 초과 시
        // 문자열 폴백이 있어 string | number 로 두고 아래 Number() 정규화를 유지한다.
        .getRawMany<{ user_id: string | number; char_count: string | number }>()
        .then((rows) => {
          this.state.seed(
            meetingId,
            rows.map((r) => ({
              user_id: Number(r.user_id),
              char_count: Number(r.char_count),
            })),
          );
          this.rehydratedMeetings.add(meetingId);
        })
        .finally(() => {
          this.rehydrations.delete(meetingId);
        });
      this.rehydrations.set(meetingId, inflight);
    }
    return inflight;
  }

  private broadcastContribution(meetingId: number) {
    this.server.to(room(meetingId)).emit('contribution:update', {
      meeting_id: meetingId,
      scores: this.state.snapshot(meetingId),
    });
  }

  private async recordPresence(
    meetingId: number,
    userId: number,
    eventType: 'join' | 'leave' | 'disconnect' | 'reconnect',
    classification?: 'voluntary' | 'involuntary',
  ) {
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId },
    });
    const offset = meeting?.t0_timestamp
      ? Date.now() - meeting.t0_timestamp.getTime()
      : 0;
    await this.presenceRepo.save(
      this.presenceRepo.create({
        meeting_id: meetingId,
        user_id: userId,
        event_type: eventType,
        disconnect_classification: classification ?? null,
        timestamp_offset_ms: offset,
        reason:
          eventType === 'disconnect'
            ? 'network'
            : eventType === 'leave'
              ? 'user_action'
              : null,
      }),
    );
  }
}
