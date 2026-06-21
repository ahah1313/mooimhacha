import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActionItemLogs1750500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`action_item_logs\` (
        \`id\`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`action_item_id\`   BIGINT UNSIGNED NULL,
        \`team_id\`          BIGINT UNSIGNED NOT NULL,
        \`actor_id\`         BIGINT UNSIGNED NOT NULL,
        \`actor_name\`       VARCHAR(100) NOT NULL,
        \`action\`           VARCHAR(16) NOT NULL,
        \`task_description\` VARCHAR(500) NOT NULL,
        \`changes\`          JSON NULL,
        \`created_at\`       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_action_item_logs_item\` (\`action_item_id\`),
        INDEX \`IDX_action_item_logs_team_date\` (\`team_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`action_item_logs\``);
  }
}
