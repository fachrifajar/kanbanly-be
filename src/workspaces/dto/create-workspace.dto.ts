import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/, {
    message:
      'Name must not have special characters, leading/trailing spaces or consecutive spaces.',
  })
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  description?: string;
}
