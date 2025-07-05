import { IsEmail, IsString, Matches, IsNotEmpty } from 'class-validator';
import { IsValidUsername } from 'src/common/decorators/is-valid-username.decorator';
import { IsStrongPassword } from 'src/common/decorators/is-strong-password.decorator';

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
  @IsStrongPassword()
  password: string;
}
