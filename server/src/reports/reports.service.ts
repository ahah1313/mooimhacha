import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Decision } from '../entities/decision.entity';
import { ActionItem } from '../entities/action-item.entity';
import { Agenda } from '../entities/agenda.entity';
import { User } from '../entities/user.entity';
import { MeetingsService } from '../meetings/meetings.service';
import { TeamsService } from '../teams/teams.service';

function esc(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 교수 제출용 리포트 — A4 인쇄 최적화 HTML (브라우저 인쇄 → PDF).
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Decision)
    private decisionRepo: Repository<Decision>,
    @InjectRepository(ActionItem)
    private actionRepo: Repository<ActionItem>,
    @InjectRepository(Agenda)
    private agendaRepo: Repository<Agenda>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private meetingsService: MeetingsService,
    private teamsService: TeamsService,
  ) {}

  async buildHtml(userId: number, meetingId: number): Promise<string> {
    const meeting = await this.meetingsService.get(userId, meetingId);
    const transcript = await this.meetingsService.getTranscript(
      userId,
      meetingId,
    );
    // 탈퇴·강퇴·팀 나감 멤버의 발화·담당 항목도 이름이 풀려야 하므로 과거 참여자 포함
    const members = await this.teamsService.getMembers(meeting.team_id, {
      includePast: true,
    });
    const nameOf = (id: number) =>
      members.find((m) => m.user_id === id)?.name ?? `사용자 ${id}`;

    const decisions = await this.decisionRepo.find({
      where: { meeting_id: meetingId },
    });
    const agendaIds = (
      await this.agendaRepo.find({ where: { meeting_id: meetingId } })
    ).map((a) => a.id);
    const actions =
      agendaIds.length > 0
        ? await this.actionRepo.find({ where: { agenda_id: In(agendaIds) } })
        : [];

    const transcriptHtml = transcript.sections
      .map(
        (s) => `
        <section class="agenda">
          <h3>${esc(s.title)}</h3>
          ${s.summary ? `<p class="summary">${esc(s.summary)}</p>` : ''}
          <ul>
            ${s.groups
              .map(
                (g) =>
                  `<li><strong>${esc(nameOf(g.user_id))}</strong> ${esc(
                    g.text,
                  )}</li>`,
              )
              .join('')}
          </ul>
        </section>`,
      )
      .join('');

    const decisionsHtml = decisions.length
      ? `<ul>${decisions.map((d) => `<li>${esc(d.content)}</li>`).join('')}</ul>`
      : '<p class="muted">기록된 결정사항이 없습니다.</p>';

    const actionsHtml = actions.length
      ? `<table>
          <thead><tr><th>담당자</th><th>내용</th><th>마감일</th><th>상태</th></tr></thead>
          <tbody>
          ${actions
            .map(
              (a) =>
                `<tr><td>${esc(
                  a.assignee_id ? nameOf(a.assignee_id) : '미정',
                )}</td><td>${esc(a.description)}</td><td>${
                  a.due_date
                    ? new Date(a.due_date).toLocaleDateString('ko-KR', {
                        timeZone: 'Asia/Seoul',
                      })
                    : '-'
                }</td><td>${esc(a.status)}</td></tr>`,
            )
            .join('')}
          </tbody>
        </table>`
      : '<p class="muted">기록된 역할 분담이 없습니다.</p>';

    const attendees = members.map((m) => esc(m.name)).join(', ');
    // 서버(컨테이너) TZ와 무관하게 KST로 표시
    const dateStr = new Date(meeting.scheduled_at).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
    });

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>회의 리포트 — ${esc(meeting.topic ?? '회의')}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { font-family: "Pretendard", -apple-system, sans-serif; }
  body { color: #1d2a23; line-height: 1.6; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #5f6d63; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 16px; border-bottom: 2px solid #1d9e75; padding-bottom: 4px; margin-top: 28px; }
  h3 { font-size: 14px; margin: 14px 0 4px; }
  .summary { color: #0f6f55; background: #e4f3ec; padding: 8px 10px; border-radius: 6px; font-size: 13px; }
  ul { margin: 6px 0; padding-left: 18px; }
  li { font-size: 13px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #e7e3d8; padding: 6px 8px; text-align: left; }
  th { background: #f1eee6; }
  .muted { color: #9aa49a; font-size: 13px; }
  .print-btn { margin: 16px 0; padding: 8px 16px; background: #1d9e75; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">인쇄 / PDF 저장</button>
  <h1>${esc(meeting.topic ?? '회의 리포트')}</h1>
  <div class="meta">
    일시: ${esc(dateStr)} · 예상 ${meeting.total_minutes}분<br />
    참석자: ${attendees}
  </div>

  <h2>안건별 회의록</h2>
  ${transcriptHtml || '<p class="muted">회의록이 없습니다.</p>'}

  <h2>결정사항</h2>
  ${decisionsHtml}

  <h2>역할 분담 (액션 아이템)</h2>
  ${actionsHtml}
</body>
</html>`;
  }
}
