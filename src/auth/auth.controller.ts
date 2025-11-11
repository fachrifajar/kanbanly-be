import { AuthGuard } from '@nestjs/passport';
import {
  Controller,
  Post,
  Body,
  HttpCode,
  Get,
  Query,
  UseGuards,
  Res,
  InternalServerErrorException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { parseTimeStringToMs } from 'src/common/utils/time.utils';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { User } from '@prisma/client';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @ResponseMessage(
    'Registration successful. Please check your email to verify your account.',
  )
  @HttpCode(HttpStatus.CREATED)
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @ResponseMessage('Email successfully verified.')
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query('token') token: string) {
    return await this.authService.verifyEmail(token);
  }

  @ResponseMessage('A new verification email has been sent.')
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() resendVerificationDto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(
      resendVerificationDto.email,
    );
  }

  @ResponseMessage('Login successful.')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);

    const expiresInString = this.configService.get<string>(
      'JWT_REFRESH_TOKEN_EXPIRATION_TIME',
    );
    if (!expiresInString) {
      throw new InternalServerErrorException(
        'Refresh token expiration is not configured.',
      );
    }

    const expiresInMs = parseTimeStringToMs(expiresInString);

    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === 'production',
      secure: true,
      // sameSite: 'lax',
      sameSite: 'none',
      path: '/',
      expires: new Date(Date.now() + 15 * 60 * 1000),
    });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === 'production',
      secure: true,
      // sameSite: 'lax',
      sameSite: 'none',
      path: '/',
      expires: new Date(Date.now() + expiresInMs),
    });

    return {
      // accessToken: result.accessToken,
      user: result.user,
    };
  }

  @UseGuards(JwtRefreshGuard)
  @ResponseMessage('Tokens refreshed successfully.')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @GetUser() data: { id: string; refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshTokens(
      data.id,
      data.refreshToken,
    );

    const expiresInString = this.configService.get<string>(
      'JWT_REFRESH_TOKEN_EXPIRATION_TIME',
    );
    if (!expiresInString) {
      throw new InternalServerErrorException(
        'Refresh token expiration is not configured.',
      );
    }

    const expiresInMs = parseTimeStringToMs(expiresInString);

    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(Date.now() + 15 * 60 * 1000),
    });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(Date.now() + expiresInMs),
    });

    return;
  }

  @UseGuards(JwtRefreshGuard)
  @ResponseMessage('Logout successful.')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId);
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return {};
  }

  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('User profile successfully retrieved.')
  @Get('profile')
  getProfile(@GetUser() user: User) {
    return user;
  }

  @ResponseMessage(
    "If an account with that email exists, we've sent instructions to reset your password.",
  )
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @ResponseMessage('Your password has been successfully reset.')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }
}
