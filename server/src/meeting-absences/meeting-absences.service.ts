import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContributionScore } from '../entities/contribution-score.entity';
import { PresenceEvent } from '../entities/presence-event.entity';
import { Meeting } from '../entities/meeting.entity';
import { MeetingAbsence } from '../entities/meeting-absence.entity';
import { AbsenceConsent } from '../entities/absence-consent.entity';
import { TeamsService } from '../teams/teams.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

@Injectable()
export class MeetingAbsencesService {
  constructor(
    @InjectRepository(Meeting)
    private meetingRepo: Repository<Meeting>,
    @InjectRepository(ContributionScore)
    private scoreRepo: Repository<ContributionScore>,
    @InjectRepository(PresenceEvent)
    private presenceRepo: Repository<PresenceEvent>,
    @InjectRepository(MeetingAbsence)
    private absenceRepo: Repository<MeetingAbsence>,
    @InjectRepository(AbsenceConsent)
    private consentRepo: Repository<AbsenceConsent>,
    private teamsService: TeamsService,
  ) {}

  // 종료된 회의의 출결 현황 — presence(입장 기록) + 저장된 ContributionScore + 사유/동의 조합
  async getAttendance(userId: number, meetingId: number) {
    const meeting = await this.requireMeeting(meetingId);
    await this.teamsService.requireMembership(userId, meeting.team_id);

    const members = await this.teamsService.getMembers(meeting.team_id);
    const [scores, presence, absences] = await Promise.all([
      this.scoreRepo.find({ where: { meeting_id: meetingId } }),
      this.presenceRepo.find({ where: { meeting_id: meetingId } }),
      this.absenceRepo.find({ where: { meeting_id: meetingId } }),
    ]);
    const consents = absences.length
      ? await this.consentRepo.find({
          where: { absence_id: In(absences.map((a) => a.id)) },
        })
      : [];

    const joined = this.joinedUserIds(presence);
    const scoreByUser = new Map(scores.map((s) => [Number(s.user_id), s]));
    const absenceByUser = new Map(absences.map((a) => [Number(a.user_id), a]));
    const consentCount = new Map<number, number>();
    const myConsent = new Set<number>();
    for (const c of consents) {
      const aid = Number(c.absence_id);
      consentCount.set(aid, (consentCount.get(aid) ?? 0) + 1);
      if (Number(c.voter_id) === userId) myConsent.add(aid);
    }

    // 동의 정족수: 그 결석 건 본인 1명을 제외한 나머지 활성 팀원의 절반 이상
    const consentRequired = Math.ceil((members.length - 1) / 2);

    return {
      meeting_id: meetingId,
      consent_required: consentRequired,
      members: members.map((m) => {
        const score = scoreByUser.get(m.user_id);
        const absence = absenceByUser.get(m.user_id);
        const status = this.deriveStatus(joined.has(m.user_id), score, absence);
        const aid = absence ? Number(absence.id) : null;
        return {
          user_id: m.user_id,
          name: m.name,
          profile_image_url: m.profile_image_url,
          status,
          late_minutes:
            status === 'late' ? this.lateMinutes(presence, m.user_id) : null,
          absence: absence
            ? {
                id: Number(absence.id),
                reason: absence.reason,
                status: absence.status,
                consent_count: aid ? (consentCount.get(aid) ?? 0) : 0,
                my_consent: aid ? myConsent.has(aid) : false,
              }
            : null,
        };
      }),
    };
  }

  // 팀의 종료된 회의들에 대한 요약 — 회의 목록 사이드바용.
  // my_status(내 출결) + pending_count(내가 아직 동의 안 한 결석 사유 수, 본인 것 제외)
  async getTeamSummary(userId: number, teamId: number) {
    await this.teamsService.requireMembership(userId, teamId);
    const meetings = await this.meetingRepo.find({
      where: { team_id: teamId, status: 'ended' },
    });
    if (meetings.length === 0) return [];
    const ids = meetings.map((m) => m.id);
    const [myScores, myPresence, absences, myConsents] = await Promise.all([
      this.scoreRepo.find({ where: { meeting_id: In(ids), user_id: userId } }),
      this.presenceRepo.find({
        where: { meeting_id: In(ids), user_id: userId },
      }),
      this.absenceRepo.find({ where: { meeting_id: In(ids) } }),
      this.consentRepo.find({ where: { voter_id: userId } }),
    ]);
    const myScoreByMeeting = new Map(
      myScores.map((s) => [Number(s.meeting_id), s]),
    );
    const myJoined = new Set(
      myPresence
        .filter((p) => p.event_type === 'join' || p.event_type === 'reconnect')
        .map((p) => Number(p.meeting_id)),
    );
    const myConsentSet = new Set(myConsents.map((c) => Number(c.absence_id)));

    return meetings.map((m) => {
      const mid = Number(m.id);
      const myAbsence = absences.find(
        (a) => Number(a.meeting_id) === mid && Number(a.user_id) === userId,
      );
      const status = this.deriveStatus(
        myJoined.has(mid),
        myScoreByMeeting.get(mid),
        myAbsence,
      );
      // 내가 처리(동의)해야 할 미처리 결석 사유 — pending · 본인 것 아님 · 아직 미동의
      const pendingCount = absences.filter(
        (a) =>
          Number(a.meeting_id) === mid &&
          a.status === 'pending' &&
          Number(a.user_id) !== userId &&
          !myConsentSet.has(Number(a.id)),
      ).length;
      return {
        meeting_id: mid,
        my_status: status,
        pending_count: pendingCount,
      };
    });
  }

  // 본인 결석 사유 입력 (종료·유효 회의, 본인이 실제 결석일 때만)
  async createAbsence(
    userId: number,
    meetingId: number,
    dto: CreateAbsenceDto,
  ) {
    const meeting = await this.requireMeeting(meetingId);
    await this.teamsService.requireMembership(userId, meeting.team_id);
    if (meeting.status !== 'ended') {
      throw new BadRequestException(
        '종료된 회의에만 사유를 입력할 수 있습니다.',
      );
    }
    if (meeting.is_invalidated) {
      throw new BadRequestException('무효 처리된 회의입니다.');
    }
    if (await this.didAttend(meetingId, userId)) {
      throw new BadRequestException(
        '결석한 회의에만 사유를 입력할 수 있습니다.',
      );
    }

    const existing = await this.absenceRepo.findOne({
      where: { meeting_id: meetingId, user_id: userId },
    });
    if (existing) {
      if (existing.status === 'approved') {
        throw new BadRequestException('이미 인정된 결석은 수정할 수 없습니다.');
      }
      existing.reason = dto.reason;
      return this.absenceRepo.save(existing);
    }
    return this.absenceRepo.save(
      this.absenceRepo.create({
        meeting_id: meetingId,
        user_id: userId,
        reason: dto.reason,
        status: 'pending',
      }),
    );
  }

  // 동의 — 결석자 제외 팀원, 멱등. 정족수 도달 시 자동 승인.
  async consent(userId: number, absenceId: number) {
    const absence = await this.absenceRepo.findOne({
      where: { id: absenceId },
    });
    if (!absence) throw new NotFoundException('결석 사유를 찾을 수 없습니다.');
    const meeting = await this.requireMeeting(absence.meeting_id);
    await this.teamsService.requireMembership(userId, meeting.team_id);
    if (Number(absence.user_id) === userId) {
      throw new BadRequestException('본인 결석에는 동의할 수 없습니다.');
    }
    if (absence.status !== 'pending') {
      return { status: absence.status };
    }

    const dup = await this.consentRepo.findOne({
      where: { absence_id: absenceId, voter_id: userId },
    });
    if (!dup) {
      await this.consentRepo.save(
        this.consentRepo.create({ absence_id: absenceId, voter_id: userId }),
      );
    }

    const members = await this.teamsService.getMembers(meeting.team_id);
    const required = Math.ceil((members.length - 1) / 2);
    const count = await this.consentRepo.count({
      where: { absence_id: absenceId },
    });
    if (count >= required && required > 0) {
      absence.status = 'approved';
      await this.absenceRepo.save(absence);
    }
    return {
      status: absence.status,
      consent_count: count,
      consent_required: required,
    };
  }

  // --- 헬퍼 ---

  private deriveStatus(
    hasJoined: boolean,
    score: ContributionScore | undefined,
    absence: MeetingAbsence | undefined,
  ): AttendanceStatus {
    // 결석 = 입장 기록 없음 (산정의 absent 정의와 일치, 산정 경로 무관하게 견고)
    if (!hasJoined) {
      return absence?.status === 'approved' ? 'excused' : 'absent';
    }
    // 지각 = 정시성 점수 미달 (외부 엔진 경로는 punctuality 미제공 → null 이면 출석 처리)
    if (score?.punctuality_score != null && score.punctuality_score < 1) {
      return 'late';
    }
    return 'present';
  }

  // 그 회의에 입장(join/reconnect) 기록이 있는 user 집합
  private joinedUserIds(presence: PresenceEvent[]): Set<number> {
    const set = new Set<number>();
    for (const p of presence) {
      if (p.event_type === 'join' || p.event_type === 'reconnect') {
        set.add(Number(p.user_id));
      }
    }
    return set;
  }

  private async didAttend(meetingId: number, userId: number): Promise<boolean> {
    const join = await this.presenceRepo.findOne({
      where: [
        { meeting_id: meetingId, user_id: userId, event_type: 'join' },
        { meeting_id: meetingId, user_id: userId, event_type: 'reconnect' },
      ],
    });
    return !!join;
  }

  // 지각 분 — 첫 입장 오프셋(산정 로직과 동일하게 max(0, …))
  private lateMinutes(
    presence: PresenceEvent[],
    userId: number,
  ): number | null {
    const joins = presence
      .filter(
        (p) =>
          Number(p.user_id) === userId &&
          (p.event_type === 'join' || p.event_type === 'reconnect'),
      )
      .map((p) => p.timestamp_offset_ms);
    if (joins.length === 0) return null;
    const firstOffset = Math.min(...joins);
    return Math.round(Math.max(0, firstOffset) / 60000);
  }

  private async requireMeeting(meetingId: number): Promise<Meeting> {
    const meeting = await this.meetingRepo.findOne({
      where: { id: meetingId },
    });
    if (!meeting) throw new NotFoundException('회의를 찾을 수 없습니다.');
    return meeting;
  }
}
