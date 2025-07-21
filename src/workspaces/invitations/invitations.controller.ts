import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Get,
  Query,
  Patch,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InvitationsService } from './invitations.service';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { GetUser } from 'src/common/decorators/get-user.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { User } from '@prisma/client';

@Controller()
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('workspaces/:workspaceId/invitations')
  @UseGuards(AuthGuard('jwt'))
  create(
    @Param('workspaceId') workspaceId: string,
    @GetUser() inviter: User,
    @Body() inviteDto: InviteMemberDto,
  ) {
    return this.invitationsService.create(workspaceId, inviter, inviteDto);
  }

  @Get('workspaces/:workspaceId/invitations')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Invitations fetched successfully.')
  findAll(
    @Param('workspaceId') workspaceId: string,
    @GetUser() user: User,
    @Query('sortBy') sortBy?: 'status' | 'asc' | 'desc' | 'role',
  ) {
    return this.invitationsService.findAll(workspaceId, user, sortBy);
  }

  @Get('invitations/validate')
  @ResponseMessage('Invitation token is valid.')
  validateToken(@Query('token') token: string) {
    return this.invitationsService.validateToken(token);
  }

  @Patch('invitations/accept/:token')
  @UseGuards(AuthGuard('jwt'))
  async acceptInvitation(@Param('token') token: string, @GetUser() user: User) {
    return this.invitationsService.accept(token, user);
  }

  @Delete('workspaces/:workspaceId/invitations/:email')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Invitation or member removed successfully.')
  async cancelOrRemove(
    @Param('workspaceId') workspaceId: string,
    @GetUser() requester: User,
    @Param('email') email: string,
  ) {
    return this.invitationsService.cancelOrRemove(
      workspaceId,
      requester,
      email,
    );
  }
}
