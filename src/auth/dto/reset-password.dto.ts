import { IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from 'src/common/decorators/is-strong-password.decorator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsStrongPassword()
  password: string;
}
