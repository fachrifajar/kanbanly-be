import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { GetUser } from '../common/decorators/get-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { User } from '@prisma/client';

@Controller('boards')
@UseGuards(AuthGuard('jwt'))
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  @ResponseMessage('Board created successfully.')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createBoardDto: CreateBoardDto, @GetUser() user: User) {
    return this.boardsService.create(createBoardDto, user);
  }

  @Get()
  @ResponseMessage('Boards retrieved successfully.')
  findAllInWorkspace(
    @Query('workspaceId') workspaceId: string,
    @GetUser('id') userId: string,
  ) {
    return this.boardsService.findAllInWorkspace(workspaceId, userId);
  }

  @Get(':id')
  @ResponseMessage('Board details retrieved successfully.')
  findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.boardsService.findOne(id, userId);
  }

  @Patch(':id')
  @ResponseMessage('Board updated successfully.')
  update(
    @Param('id') id: string,
    @GetUser() user: User,
    @Body() updateBoardDto: UpdateBoardDto,
  ) {
    return this.boardsService.update(id, user, updateBoardDto);
  }

  @Delete(':id')
  @ResponseMessage('Board deleted successfully.')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.boardsService.remove(id, user);
  }
}
