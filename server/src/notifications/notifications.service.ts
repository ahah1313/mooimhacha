import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { Meeting } from '../entities/meeting.entity';
import { TeamMembership } from '../entities/team-membership.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    @InjectRepository(Notification)
    private notiRepo: Repository<Notification>,
    @InjectRepository(Meeting)
    private meetingRepo: Repository<Meeting>,
    @InjectRepository(TeamMembership)
    private membershipRepo: Repository<TeamMembership>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private config: ConfigService,
  ) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async create(
    userId: number,
    type: NotificationType,
    title: string,
    body?: string,
    refs?: { meeting_id?: number; action_item_id?: number },
  ) {
    const noti = await this.notiRepo.save(
      this.notiRepo.create({
        user_id: userId,
        type,
        title,
        body: body ?? null,
        meeting_id: refs?.meeting_id ?? null,
        action_item_id: refs?.action_item_id ?? null,
      }),
    );
    void this.sendEmail(userId, title, body);
    return noti;
  }

  async listForUser(userId: number, unreadOnly = false) {
    return this.notiRepo.find({
      where: unreadOnly
        ? { user_id: userId, read: false }
        : { user_id: userId },
      order: { created_at: 'DESC' },
      take: 50,
    });
  }

  async markRead(userId: number, id: number) {
    const noti = await this.notiRepo.findOne({ where: { id } });
    if (!noti || noti.user_id !== userId) {
      throw new NotFoundException('알림을 찾을 수 없습니다.');
    }
    noti.read = true;
    return this.notiRepo.save(noti);
  }

  async markAllRead(userId: number) {
    await this.notiRepo.update(
      { user_id: userId, read: false },
      { read: true },
    );
    return { ok: true };
  }

  // 회의 5분 전 알림 (매분 점검)
  @Cron(CronExpression.EVERY_MINUTE)
  async checkUpcomingMeetings() {
    const now = new Date();
    const in5 = new Date(now.getTime() + 5 * 60 * 1000);
    const upcoming = await this.meetingRepo.find({
      where: { status: 'scheduled', scheduled_at: Between(now, in5) },
    });
    for (const m of upcoming) {
      const members = await this.membershipRepo.find({
        where: { team_id: m.team_id },
      });
      for (const member of members) {
        // 중복 방지: 동일 회의·유형 알림이 있으면 건너뜀
        const exists = await this.notiRepo.findOne({
          where: {
            user_id: member.user_id,
            meeting_id: m.id,
            type: 'meeting_soon',
          },
        });
        if (exists) continue;
        await this.create(
          member.user_id,
          'meeting_soon',
          '회의가 곧 시작됩니다',
          // 컨테이너 TZ(UTC)와 무관하게 KST로 표시
          `${m.topic ?? '회의'} — ${new Date(m.scheduled_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
          { meeting_id: m.id },
        );
      }
    }
  }

  private async sendEmail(userId: number, subject: string, text?: string) {
    if (!this.transporter) return;
    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user?.kakao_email) return;
      // 이메일 수신거부 사용자는 메일만 스킵 (인앱 알림은 create()에서 이미 저장됨)
      if (user.email_opt_out) return;
      await this.transporter.sendMail({
        from: this.config.get<string>('MAIL_FROM') ?? 'no-reply@mooimhacha',
        to: user.kakao_email,
        subject: `[무임하차] ${subject}`,
        text: text ?? subject,
      });
    } catch (e) {
      this.logger.error('이메일 전송 실패', e as Error);
    }
  }
}
