import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ActionItemLogAction = 'edit' | 'delete';

export interface ActionItemChange {
  field: string;
  from: string | null;
  to: string | null;
}

@Entity('action_item_logs')
@Index(['action_item_id'])
@Index(['team_id', 'created_at'])
export class ActionItemLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  // 삭제 후에도 로그는 남아야 하므로 nullable
  @Column({ type: 'bigint', unsigned: true, nullable: true })
  action_item_id!: number | null;

  @Column({ type: 'bigint', unsigned: true })
  team_id!: number;

  @Column({ type: 'bigint', unsigned: true })
  actor_id!: number;

  @Column({ type: 'varchar', length: 100 })
  actor_name!: string;

  @Column({ type: 'varchar', length: 16 })
  action!: ActionItemLogAction;

  // 수정/삭제 시점의 태스크 이름 스냅샷
  @Column({ type: 'varchar', length: 500 })
  task_description!: string;

  // 수정 시: [{field, from, to}], 삭제 시: null
  @Column({ type: 'json', nullable: true })
  changes!: ActionItemChange[] | null;

  @CreateDateColumn()
  created_at!: Date;
}
