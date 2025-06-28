import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])\S{8,}$/, {
    message:
      'Password is too weak. It must be at least 8 characters long and contain uppercase, lowercase, number, special character, and no whitespace.',
  })
  password: string;
}
