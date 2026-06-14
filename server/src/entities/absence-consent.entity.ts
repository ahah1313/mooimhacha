import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// 사유 결석 1건에 대한 팀원의 동의 1표. UNIQUE 로 중복 동의를 막는다.
@Entity('absence_consents')
@Index(['absence_id', 'voter_id'], { unique: true })
export class AbsenceConsent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: number;

  @Column({ type: 'bigint', unsigned: true })
  absence_id!: number;

  @Column({ type: 'bigint', unsigned: true })
  voter_id!: number;

  @CreateDateColumn()
  created_at!: Date;
}
