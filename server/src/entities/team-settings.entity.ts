import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DeadlinePenaltyCurve = 'standard' | 'lenient' | 'strict';
export type AbsentMeetingHandling = 'exclude' | 'zero' | 'attendance_only';
export type ContributionVisibility = 'team' | 'leader' | 'self';

@Entity('team_settings')
export class TeamSettings {
  @PrimaryColumn({ type: 'bigint' })
  team_id!: number;

  @Column({ type: 'decimal', precision: 4, scale: 3, default: 0.1 })
  punctuality_grace_ratio!: number;

  @Column({ type: 'int', default: 500 })
  max_utterance_chars!: number;

  @Column({ type: 'int', default: 30 })
  presence_grace_seconds!: number;

  @Column({
    type: 'enum',
    enum: ['exclude', 'zero', 'attendance_only'],
    default: 'exclude',
  })
  absent_meeting_handling!: AbsentMeetingHandling;

  @Column({
    type: 'enum',
    enum: ['standard', 'lenient', 'strict'],
    default: 'standard',
  })
  deadline_penalty_curve!: DeadlinePenaltyCurve;

  @Column({
    type: 'enum',
    enum: ['team', 'self', 'leader'],
    default: 'team',
  })
  contribution_visibility!: ContributionVisibility;

  @Column({ type: 'int', default: 5 })
  min_meeting_minutes!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.5 })
  final_task_weight!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  leader_bonus_multiplier!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
