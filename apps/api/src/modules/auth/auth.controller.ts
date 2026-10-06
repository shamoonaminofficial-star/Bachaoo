import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService, RequestMeta } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/** Minimal structural types so we don't depend on @types/express. */
interface HttpRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
}
interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options?: Record<string, unknown>): void;
}

const REFRESH_COOKIE = 'bachatly_refresh';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Token delivery contract (see docs/API.md):
 * - accessToken: returned in the JSON body (short-lived, 15m).
 * - refreshToken: set as an httpOnly cookie (bachatly_refresh) AND echoed in
 *   the JSON body for native/mobile clients that cannot use cookies.
 * The /auth/refresh endpoint accepts the token from the body OR the cookie.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private meta(req: HttpRequest): RequestMeta {
    return { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
  }

  private setRefreshCookie(res: CookieResponse, refreshToken: string) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }

  private clearRefreshCookie(res: CookieResponse) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Phase 13: anti-abuse on signup
  @Audit('auth.register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const result = await this.auth.register(dto, this.meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Audit('auth.login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const result = await this.auth.login(dto, this.meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const refreshToken = dto.refreshToken || req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired. Please sign in again.',
      });
    }
    const result = await this.auth.refresh(refreshToken, this.meta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Body() dto: RefreshDto,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const refreshToken = dto.refreshToken || req.cookies?.[REFRESH_COOKIE];
    const result = await this.auth.logout(userId, refreshToken);
    this.clearRefreshCookie(res);
    return result;
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const result = await this.auth.logoutAll(userId);
    this.clearRefreshCookie(res);
    return result;
  }

  /** Alias under the sessions namespace (Phase 7 contract). */
  @ApiBearerAuth()
  @Post('sessions/logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAllSessions(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const result = await this.auth.logoutAll(userId);
    this.clearRefreshCookie(res);
    return result;
  }

  /**
   * List active sessions (device / IP / last seen) for the current user.
   * Rate-limited: 30/min.
   */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('sessions')
  listSessions(@CurrentUser('id') userId: string) {
    return this.auth.listSessions(userId);
  }

  /**
   * Change the signed-in user's password. Rate-limited: 5/10min.
   * Revokes all sessions — the caller must re-authenticate.
   */
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: HttpRequest,
  ) {
    return this.auth.changePassword(userId, dto, this.meta(req));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: OtpVerifyDto,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const result = await this.auth.verifyOtp(dto, this.meta(req));
    if ('refreshToken' in result && result.refreshToken) {
      this.setRefreshCookie(res, result.refreshToken as string);
    }
    return result;
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: HttpRequest) {
    return this.auth.resetPassword(dto, this.meta(req));
  }
}
