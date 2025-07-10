import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
  IsHexColor,
} from 'class-validator';

type BoardVisibilityType = 'PUBLIC' | 'WORKSPACE' | 'PRIVATE';

export class CreateBoardDto {
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required.' })
  @MinLength(3)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  workspaceId: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  description?: string;

  @IsHexColor()
  color?: string;

  @IsIn(['PUBLIC', 'WORKSPACE', 'PRIVATE'])
  visibility?: BoardVisibilityType;
}
