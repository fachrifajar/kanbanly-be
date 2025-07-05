import { IsEmail, IsString, Matches, IsNotEmpty } from 'class-validator';
import { IsValidUsername } from 'src/common/decorators/is-valid-username.decorator';

export class RegisterDto {
  @IsNotEmpty()
  @IsEmail({}, { message: 'Invalid email format.' })
  email: string;

  @IsNotEmpty()
  @IsValidUsername({
    message:
      'Username must be 3-20 characters, lowercase, with only letters, numbers, and up to 2 dots/underscores. Cannot start, end, or repeat with special characters.',
  })
  username: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])\S{8,}$/, {
    message:
      'Password is too weak. It must be at least 8 characters long and contain uppercase, lowercase, number, special character, and no whitespace.',
  })
  password: string;
}
