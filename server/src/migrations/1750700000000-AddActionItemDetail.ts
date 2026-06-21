import { MigrationInterface, QueryRunner } from 'typeorm';

// 태스크 생성 시 선택 입력 세부사항(메모) 컬럼 추가. nullable 추가형(기존 데이터 영향 없음).
export class AddActionItemDetail1750700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`action_items\` ADD COLUMN \`detail\` TEXT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`action_items\` DROP COLUMN \`detail\``,
    );
  }
}
