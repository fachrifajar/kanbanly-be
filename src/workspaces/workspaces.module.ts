import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ActivitiesModule } from 'src/activities/activities.module';
import { InvitationsService } from './invitations/invitations.service';
import { EmailModule } from 'src/email/email.module';
import { InvitationsController } from './invitations/invitations.controller';

@Module({
  imports: [PrismaModule, ActivitiesModule, EmailModule],
  providers: [WorkspacesService, InvitationsService],
  controllers: [WorkspacesController, InvitationsController],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
