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
  private fromEmail: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('BREVO_SMTP_HOST');
    const port = this.configService.get<number>('BREVO_SMTP_PORT');
    const user = this.configService.get<string>('BREVO_SMTP_USER');
    const pass = this.configService.get<string>('BREVO_SMTP_PASS');
    const from = this.configService.get<string>('EMAIL_FROM');

    if (!host || !port || !user || !pass || !from) {
      throw new InternalServerErrorException('SMTP configuration is missing.');
    }

    this.fromEmail = from;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendUserVerificationEmail(user: User, token: string) {
    this.ensureTransporterInitialized();

    const verificationUrl = `http://localhost:3000/api/auth/verify-email?token=${token}`;
    const mailOptions = {
      from: `"Kanbanly" <${this.fromEmail}>`,
      to: user.email,
      subject: 'Welcome! Please Verify Your Email',
      html: `<p>Hello ${user.username},</p><p>Please verify your email by clicking this link: <a href="${verificationUrl}">${verificationUrl}</a></p>`,
    };

    await this.send(mailOptions);
  }

  async sendPasswordResetEmail(user: User, token: string) {
    this.ensureTransporterInitialized();

    const resetUrl = `http://localhost:3001/reset-password?token=${token}`;
    const mailOptions = {
      from: `"Kanbanly App" <${this.fromEmail}>`,
      to: user.email,
      subject: 'Reset Your Kanbanly Password',
      html: `
        <p>Hello ${user.username},</p>
        <p>You requested to reset your password. Please click the link below to set a new password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request a password reset, please ignore this email.</p>
      `,
    };

    await this.send(mailOptions);
  }

  async sendWorkspaceInvitationEmail(
    recipientEmail: string,
    inviterName: string,
    workspaceName: string,
    token: string,
  ) {
    if (!this.transporter) {
      throw new InternalServerErrorException(
        'Email transporter is not initialized.',
      );
    }

    const acceptUrl = `http://localhost:3001/invitations/accept?token=${token}`;
    const mailOptions = {
      from: `"Kanbanly App" <${this.fromEmail}>`,
      to: recipientEmail,
      subject: `You're invited to join the "${workspaceName}" workspace on Kanbanly`,
      html: `
      <p>Hello!</p>
      <p><b>${inviterName}</b> has invited you to collaborate on the <b>${workspaceName}</b> workspace.</p>
      <p>Click the link below to accept the invitation:</p>
      <p><a href="${acceptUrl}" style="color: blue;">Accept Invitation</a></p>
      <p>This link will expire in 3 days.</p>
    `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error(
        `Error sending invitation email to ${recipientEmail}:`,
        error,
      );
      throw new InternalServerErrorException(
        `Failed to send invitation email to ${recipientEmail}`,
      );
    }
  }

  private async send(mailOptions: nodemailer.SendMailOptions) {
    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new InternalServerErrorException('Failed to send email.');
    }
  }

  private ensureTransporterInitialized() {
    if (!this.transporter) {
      throw new InternalServerErrorException(
        'Email transporter is not initialized.',
      );
    }
  }
}
