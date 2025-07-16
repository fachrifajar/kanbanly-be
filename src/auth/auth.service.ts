import {
  Injectable,
  ConflictException,
  BadRequestException,
  // NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { formatDistanceToNow } from 'date-fns';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from 'src/users/users.service';
import { EmailService } from 'src/email/email.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserResponseDto } from 'src/users/dto/user-response.dto';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<UserResponseDto> {
    const { email, password, username } = registerDto;

    const existingUser = await this.usersService.findFirstByEmailOrUsername({
      email,
      username,
    });
    if (existingUser) {
      throw new ConflictException('Email or username is already in use.');
    }

    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpiresAt = new Date(Date.now() + 3600000); // 1 hour
    // const emailVerificationExpiresAt = new Date(Date.now() + 3600); // 1 minutes

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
      emailVerificationToken,
      emailVerificationExpiresAt,
    });

    try {
      await this.emailService.sendUserVerificationEmail(
        user,
        emailVerificationToken,
      );
    } catch (error) {
      console.error(
        `Failed to send verification email to ${user.email}`,
        error,
      );
    }

    return new UserResponseDto({
      ...user,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      avatar: user.avatar ?? undefined,
    });
  }

  async verifyEmail(token: string) {
    const user = await this.prismaService.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token.');
    }

    if (!user.emailVerificationExpiresAt) {
      throw new BadRequestException('Invalid token state.');
    }

    if (new Date() > user.emailVerificationExpiresAt) {
      throw new BadRequestException('Verification token has expired.');
    }

    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    return { message: 'Email successfully verified. You can now log in.' };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.isEmailVerified) {
      return;
    }

    if (
      user.emailVerificationExpiresAt &&
      new Date() < user.emailVerificationExpiresAt
    ) {
      const timeLeft = formatDistanceToNow(user.emailVerificationExpiresAt);
      throw new BadRequestException(
        `An email has already been sent. Please try again in ${timeLeft}.`,
      );
    }

    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpiresAt = new Date(Date.now() + 3600000); // 1 hour

    await this.usersService.updateVerificationToken(
      user.id,
      emailVerificationToken,
      emailVerificationExpiresAt,
    );

    try {
      await this.emailService.sendUserVerificationEmail(
        user,
        emailVerificationToken,
      );
    } catch (error) {
      console.error(
        `Failed to resend verification email to ${user.email}`,
        error,
      );
    }
  }

  private async _generateAndSaveTokens(user: User) {
    const accessTokenPayload = { sub: user.id, email: user.email };
    const refreshTokenPayload = { sub: user.id };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload),
      this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_TOKEN_EXPIRATION_TIME',
        ),
      }),
    ]);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

    await this.usersService.updateLoginData(user.id, hashedRefreshToken);

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials.');
    if (!user.isEmailVerified)
      throw new UnauthorizedException('Please verify your email first.');
    const isPasswordMatching = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordMatching)
      throw new UnauthorizedException('Invalid credentials.');

    const tokens = await this._generateAndSaveTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: new UserResponseDto(user),
    };
  }

  async logout(userId: string) {
    return this.usersService.clearRefreshToken(userId);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.hashedRefreshToken)
      throw new UnauthorizedException('Access Denied');

    const isRefreshTokenMatching = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );
    if (!isRefreshTokenMatching)
      throw new UnauthorizedException('Access Denied');

    const tokens = await this._generateAndSaveTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);

    if (!user) return;
    if (!user.isEmailVerified)
      throw new BadRequestException('Email not verified. Please verify first.');

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiresAt = new Date(Date.now() + 3600000); // 1 hour

    await this.usersService.setPasswordResetToken(
      user.id,
      resetToken,
      resetTokenExpiresAt,
    );
    await this.emailService.sendPasswordResetEmail(user, resetToken);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { token, password } = resetPasswordDto;

    const user = await this.usersService.findByPasswordResetToken(token);

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      new Date() > user.passwordResetExpiresAt ||
      !user.password
    ) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const isPasswordMatching = await bcrypt.compare(
      resetPasswordDto.password,
      user.password,
    );

    if (isPasswordMatching)
      throw new UnauthorizedException(
        'Password cannot be the same as the old one.',
      );

    const newHashedPassword = await bcrypt.hash(password, 12);
    await this.usersService.updateUserPassword(user.id, newHashedPassword);
  }
}
