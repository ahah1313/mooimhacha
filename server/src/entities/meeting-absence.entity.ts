import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// 사유 결석 상태: 입력됨(pending) → 팀원 과반 동의 시 인정(approved).
// rejected 는 향후 명시적 거부용 예약 — 현재 자동 전이 없음.
export type AbsenceStatus = 'pending' | 'approved' | 'rejected';

// 결석한 회의에 대해 본인이 입력하는 사유 1건 (회의 × 사용자).
@Entity('meeting_absences')
@Index(['meeting_id', 'user_id'], { unique: true })
export class MeetingAbsence {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ type: 'bigint', unsigned: true })
  meeting_id!: number;

  @Column({ type: 'bigint', unsigned: true })
  user_id!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: AbsenceStatus;

  @CreateDateColumn()
  created_at!: Date;
}
