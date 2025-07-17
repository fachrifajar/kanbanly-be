import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivitiesService } from '../activities/activities.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import {
  BoardVisibility,
  User,
  ActivityType,
  WorkspaceRole,
  Prisma,
  Board,
} from '@prisma/client';
import { buildFieldDiffDeep } from 'src/common/utils/diff.utils';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  async create(createBoardDto: CreateBoardDto, user: User) {
    const { workspaceId, name } = createBoardDto;

    await this.workspacesService.validateUserRole(workspaceId, user.id, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    const boardCount = await this.prisma.board.count({
      where: {
        workspaceId,
      },
    });

    if (boardCount >= 10) {
      throw new ForbiddenException('Board limit reached (max 10).');
    }

    return this.prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: {
          name,
          description: createBoardDto.description,
          color: createBoardDto.color,
          visibility: createBoardDto.visibility,
          workspace: { connect: { id: workspaceId } },
        },
      });

      await this.activitiesService.log({
        user: user,
        action: ActivityType.BOARD_CREATED,
        context: {
          workspaceId: board.workspaceId,
          boardId: board.id,
          boardName: board.name,
        },
        metadata: {
          name: board.name,
          description: board.description,
          color: board.color,
          visibility: board.visibility,
          id: board.id,
        },
        tx,
      });

      return board;
    });
  }

  async findAllInWorkspace(workspaceId: string, userId: string) {
    await this.workspacesService.validateUserIsMember(workspaceId, userId);

    return this.prisma.board.findMany({
      where: {
        workspaceId: workspaceId,
        OR: [
          {
            visibility: {
              in: [BoardVisibility.WORKSPACE, BoardVisibility.PUBLIC],
            },
          },
          {
            visibility: BoardVisibility.PRIVATE,
            members: { some: { userId: userId } },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(boardId: string, userId: string) {
    await this.validateBoardAccess(boardId, userId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },

      include: {
        lists: {
          orderBy: { position: 'asc' },
          include: {
            cards: {
              orderBy: { position: 'asc' },

              include: {
                assignee: {
                  select: { id: true, username: true, avatar: true },
                },
                cardLabels: {
                  include: {
                    label: true,
                  },
                },
                _count: {
                  select: {
                    comments: true,
                    attachments: true,
                  },
                },
              },
            },
          },
        },
        labels: true,
      },
    });

    if (!board) {
      throw new NotFoundException('Board not found.');
    }

    return board;
  }

  async update(boardId: string, user: User, updateBoardDto: UpdateBoardDto) {
    const board = await this.validateBoardAccess(boardId, user.id);

    await this.workspacesService.validateUserRole(board.workspaceId, user.id, [
      WorkspaceRole.OWNER,
      WorkspaceRole.ADMIN,
    ]);

    return this.prisma.$transaction(async (tx) => {
      const existingBoard = await tx.board.findUniqueOrThrow({
        where: { id: boardId },
      });

      const updatedBoard = await tx.board.update({
        where: { id: boardId },
        data: updateBoardDto,
      });

      const fields = Object.keys(updateBoardDto) as (keyof Board)[];
      const diff = buildFieldDiffDeep(existingBoard, updatedBoard, fields);

      await this.activitiesService.log({
        user: user,
        action: ActivityType.BOARD_UPDATED,
        context: {
          workspaceId: updatedBoard.workspaceId,
          boardId: updatedBoard.id,
          boardName: updatedBoard.name,
        },
        metadata: {
          fieldChanges: diff,
          boardId: updatedBoard.id,
          workspaceId: board.workspaceId,
        },
        tx,
      });

      return updatedBoard;
    });
  }

  async remove(boardId: string, user: User) {
    return this.prisma.$transaction(async (tx) => {
      const boardToDelete = await this.validateBoardAccess(boardId, user.id);

      await this.workspacesService.validateUserRole(
        boardToDelete.workspaceId,
        user.id,
        [WorkspaceRole.OWNER, WorkspaceRole.ADMIN],
      );

      await this.activitiesService.log({
        user: user,
        action: ActivityType.BOARD_DELETED,
        context: {
          workspaceId: boardToDelete.workspaceId,
          boardId: boardToDelete.id,
          boardName: boardToDelete.name,
        },
        metadata: {
          boardId: boardToDelete.id,
          workspaceId: boardToDelete.workspaceId,
          boardName: boardToDelete.name,
        },
        tx,
      });

      await tx.board.delete({ where: { id: boardId } });
    });
  }

  async validateBoardAccess(
    boardId: string,
    userId: string,
    prismaClient?: Prisma.TransactionClient,
  ) {
    const client = prismaClient || this.prisma;

    const board = await client.board.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundException('Board not found.');
    }

    if (board.visibility === 'PUBLIC') {
      return board;
    }

    await this.workspacesService.validateUserIsMember(
      board.workspaceId,
      userId,
      client,
    );

    if (board.visibility === 'WORKSPACE') {
      return board;
    }

    if (board.visibility === 'PRIVATE') {
      const boardMember = await client.boardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
      });
      if (boardMember) {
        return board;
      }
    }

    throw new ForbiddenException('You do not have access to this board.');
  }
}
