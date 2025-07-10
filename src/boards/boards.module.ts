import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ActivitiesModule } from 'src/activities/activities.module';
import { WorkspacesModule } from 'src/workspaces/workspaces.module';

@Module({
  imports: [PrismaModule, ActivitiesModule, WorkspacesModule],
  controllers: [BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}
