import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// 기한 연장 요청 상태: 요청됨(pending) → 팀장 수락(approved)/거절(rejected).
export type ExtensionStatus = 'pending' | 'approved' | 'rejected';

// 태스크(액션 아이템) 기한 연장 요청 1건. 거절/수락 후 재요청은 새 행으로 남는다.
@Entity('task_extension_requests')
@Index(['action_item_id', 'status'])
export class TaskExtensionRequest {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ type: 'bigint', unsigned: true })
  action_item_id!: number;

  @Column({ type: 'bigint', unsigned: true })
  requester_id!: number;

  @Column({ type: 'datetime', nullable: true })
  requested_due_date!: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  requested_description!: string | null;

  @Column({ type: 'int', nullable: true })
  requested_difficulty!: number | null;

  // null = 변경 없음, -1 = 담당자 해제, 양수 = 새 담당자 user_id
  @Column({ type: 'bigint', nullable: true })
  requested_assignee_id!: number | null;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: ExtensionStatus;

  @CreateDateColumn()
  created_at!: Date;
}
