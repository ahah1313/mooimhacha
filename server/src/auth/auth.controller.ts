import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { KakaoLoginDto } from './dto/kakao-login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Get('kakao/url')
  @ApiOperation({ summary: '카카오 인가 URL 발급 (클라이언트가 이 URL로 이동)' })
  kakaoUrl() {
    return { url: this.authService.getKakaoAuthUrl() };
  }

  @Get('kakao/callback')
  @ApiOperation({
    summary: '카카오 인가 콜백 → 토큰 발급 후 클라이언트로 리다이렉트',
  })
  async kakaoCallback(@Query('code') code: string, @Res() res: Response) {
    const clientOrigin =
      this.config.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:5173';
    try {
      const result = await this.authService.kakaoLogin({
        authorization_code: code,
      });
      // 토큰은 URL fragment(#)로 전달 — 서버 로그·리퍼러에 남지 않음
      const params = new URLSearchParams({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        is_new_user: String(result.is_new_user),
      });
      res.redirect(`${clientOrigin}/auth/callback#${params.toString()}`);
    } catch {
      res.redirect(`${clientOrigin}/?login_error=1`);
    }
  }

  @Post('kakao')
  @ApiOperation({ summary: '카카오 로그인 / 회원가입' })
  kakaoLogin(@Body() dto: KakaoLoginDto) {
    return this.authService.kakaoLogin(dto);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '회원 정보 등록 (최초 가입 시 대학교·학과 입력)' })
  updateProfile(
    @Request() req: { user: { id: number } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 로그인 사용자 정보' })
  me(@Request() req: { user: User }) {
    const u = req.user;
    return {
      id: u.id,
      name: u.name,
      kakao_email: u.kakao_email,
      university: u.university,
      department: u.department,
      profile_image_url: u.profile_image_url,
      email_opt_out: u.email_opt_out,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '액세스 토큰 재발급' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: '로그아웃' })
  logout() {
    return;
  }
}
