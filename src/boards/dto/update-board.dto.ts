import { OmitType } from '@nestjs/mapped-types';
import { CreateBoardDto } from './create-board.dto';

export class UpdateBoardDto extends OmitType(CreateBoardDto, [
  'workspaceId',
] as const) {}
