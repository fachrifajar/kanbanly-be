import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendVerificationDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;
}
