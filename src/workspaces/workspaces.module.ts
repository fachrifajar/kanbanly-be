import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ActivitiesModule } from 'src/activities/activities.module';

@Module({
  imports: [PrismaModule, ActivitiesModule],
  providers: [WorkspacesService],
  controllers: [WorkspacesController],
})
export class WorkspacesModule {}
