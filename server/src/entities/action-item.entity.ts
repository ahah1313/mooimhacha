import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ActionStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type ActionSource = 'manual' | 'ai_extracted';

// 액션은 회의와 분리·개인 소유 — team_id로 user×team 집계(스냅샷 없이 라이브 계산).
@Entity('action_items')
@Index(['team_id', 'assignee_id'])
// summarize 재정리(replace)·confirm·회의 삭제 cascade가 meeting_id로 조회
@Index(['meeting_id'])
export class ActionItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ type: 'bigint', unsigned: true })
  team_id!: number;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  assignee_id!: number | null;

  @Column({ type: 'text' })
  description!: string;

  // 선택 입력 세부사항(메모). 점수에 영향 없는 메타데이터.
  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  @Column({ type: 'datetime', nullable: true })
  due_date!: Date | null;

  // 마감 준수 산정(완료 시각 vs due_date)
  @Column({ type: 'datetime', nullable: true })
  completed_at!: Date | null;

  // 난이도 상/중/하 = 3/2/1 (회의 중 기본 '중')
  @Column({ type: 'int', default: 2 })
  difficulty!: number;

  @Column({ type: 'boolean', default: false })
  is_for_next_meeting!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'todo' })
  status!: ActionStatus;

  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source!: ActionSource;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  source_utterance_id!: number | null;

  // AI 종합 정리가 만든 액션의 회의 스코프(재정리 시 미확정분 교체에 사용)
  @Column({ type: 'bigint', unsigned: true, nullable: true })
  meeting_id!: number | null;

  // 입력 시점 진행 중 안건에 자동 연결
  @Column({ type: 'bigint', unsigned: true, nullable: true })
  agenda_id!: number | null;

  // 자료 첨부는 외부 링크만 (docs/09)
  @Column({ type: 'varchar', length: 1000, nullable: true })
  link_url!: string | null;

  @Column({ type: 'boolean', default: false })
  confirmed!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
