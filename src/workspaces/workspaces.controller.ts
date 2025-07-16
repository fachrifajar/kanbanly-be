import {
  Controller,
  Post,
  UseGuards,
  Body,
  Patch,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
// custom decorators
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { GetUser } from 'src/common/decorators/get-user.decorator';
// dto
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
// guards
import { AuthGuard } from '@nestjs/passport';
// services
import { WorkspacesService } from './workspaces.service';
// types
import { User } from '@prisma/client';

@Controller('workspaces')
@UseGuards(AuthGuard('jwt'))
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @ResponseMessage('Workspace created successfully.')
  @HttpCode(HttpStatus.CREATED)
  createWorkspace(
    @Body() createWorkspaceDto: CreateWorkspaceDto,
    @GetUser() user: User,
  ) {
    return this.workspacesService.create(createWorkspaceDto, user);
  }

  @Get()
  @ResponseMessage("User's workspaces retrieved successfully.")
  findAllWhereMember(@GetUser('id') userId: string) {
    return this.workspacesService.findAllWhereMember(userId);
  }

  @Get(':id')
  @ResponseMessage('Workspace details retrieved successfully.')
  findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.workspacesService.findOne(id, userId);
  }

  @Patch(':id')
  @ResponseMessage('Workspace updated successfully.')
  update(
    @Param('id') id: string,
    @GetUser() user: User,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(id, user, updateWorkspaceDto);
  }

  @Delete(':id')
  @ResponseMessage('Workspace deleted successfully.')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @GetUser() user: User) {
    return this.workspacesService.remove(id, user);
  }
}
