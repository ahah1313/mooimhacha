import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { TeamsModule } from './teams/teams.module';
import { User } from './entities/user.entity';
import { Team } from './entities/team.entity';
import { TeamMembership } from './entities/team-membership.entity';
import { TeamSettings } from './entities/team-settings.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [User, Team, TeamMembership, TeamSettings],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        timezone: '+09:00',
        // 한글 등 멀티바이트 문자 깨짐(???) 방지
        charset: 'utf8mb4',
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    TeamsModule,
  ],
})
export class AppModule {}
