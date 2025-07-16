import {
  Injectable,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SentMessageInfo } from 'nodemailer';
import { User } from '@prisma/client';

@Injectable()
export class EmailService implements OnModuleInit {
  private transporter: nodemailer.Transporter<SentMessageInfo>;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('BREVO_SMTP_HOST');
    const port = this.configService.get<number>('BREVO_SMTP_PORT');
    const user = this.configService.get<string>('BREVO_SMTP_USER');
    const pass = this.configService.get<string>('BREVO_SMTP_PASS');

    if (!host || !port || !user || !pass) {
      throw new InternalServerErrorException('SMTP configuration is missing.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    // console.log('Brevo SMTP transporter configured and ready.');
  }

  async sendUserVerificationEmail(user: User, token: string) {
    if (!this.transporter) {
      throw new InternalServerErrorException(
        'Email transporter is not initialized.',
      );
    }

    const verificationUrl = `http://localhost:3000/api/auth/verify-email?token=${token}`;
    const mailOptions = {
      from: '"Kanbanly" <fchfjr@yahoo.com>',
      to: user.email,
      subject: 'Welcome! Please Verify Your Email',
      html: `<p>Hello ${user.username},</p><p>Please verify your email by clicking this link: <a href="${verificationUrl}">${verificationUrl}</a></p>`,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending email via Brevo:', error);
    }
  }

  async sendPasswordResetEmail(user: User, token: string) {
    if (!this.transporter) {
      throw new InternalServerErrorException(
        'Email transporter is not initialized.',
      );
    }

    const resetUrl = `http://localhost:3001/reset-password?token=${token}`;

    const mailOptions = {
      from: '"Kanbanly App" <fchfjr@yahoo.com>',
      to: user.email,
      subject: 'Reset Your Kanbanly Password',
      html: `
        <p>Hello ${user.username},</p>
        <p>You requested to reset your password. Please click the link below to set a new password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request a password reset, please ignore this email.</p>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending password reset email:', error);
    }
  }
}
