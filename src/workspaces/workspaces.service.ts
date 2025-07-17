import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import {
  Prisma,
  WorkspaceRole,
  User,
  ActivityType,
  Workspace,
} from '@prisma/client';
import { ActivitiesService } from 'src/activities/activities.service';
import { buildFieldDiffDeep } from 'src/common/utils/diff.utils';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(createWorkspaceDto: CreateWorkspaceDto, user: User) {
    const workspaceCount = await this.prisma.workspace.count({
      where: {
        members: {
          some: {
            userId: user.id,
            role: WorkspaceRole.OWNER,
          },
        },
      },
    });

    if (workspaceCount >= 10) {
      throw new ForbiddenException('Workspace limit reached (max 10).');
    }

    const duplicate = await this.prisma.workspace.findFirst({
      where: {
        name: createWorkspaceDto.name,
        members: {
          some: {
            userId: user.id,
          },
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'You already have a workspace with this name.',
      );
    }

    const slug = await this._generateUniqueSlug(createWorkspaceDto.name);

    const workspace = await this.prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({
        data: {
          name: createWorkspaceDto.name,
          description: createWorkspaceDto.description,
          slug,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: newWorkspace.id,
          userId: user.id,
          role: WorkspaceRole.OWNER,
        },
      });

      await this.activitiesService.log({
        user: user,
        action: ActivityType.WORKSPACE_CREATED,
        context: {
          workspaceId: newWorkspace.id,
          workspaceName: newWorkspace.name,
        },
        metadata: {
          name: newWorkspace.name,
          description: newWorkspace.description,
          id: newWorkspace.id,
        },
        tx,
      });

      return newWorkspace;
    });

    return workspace;
  }

  async update(
    workspaceId: string,
    user: User,
    updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateUserRole(workspaceId, user.id, [
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
      ]);

      const existingWorkspace = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });

      const dataToUpdate: Prisma.WorkspaceUpdateInput = {};

      if (updateWorkspaceDto.name) {
        dataToUpdate.name = updateWorkspaceDto.name;
        dataToUpdate.slug = await this._generateUniqueSlug(
          updateWorkspaceDto.name,
          workspaceId,
        );
      }

      if ('description' in updateWorkspaceDto) {
        dataToUpdate.description = updateWorkspaceDto.description;
      }

      const updatedWorkspace = await tx.workspace.update({
        where: { id: workspaceId },
        data: dataToUpdate,
      });

      const fields = Object.keys(updateWorkspaceDto) as (keyof Workspace)[];
      if (updateWorkspaceDto.name) fields.push('slug');
      const diff = buildFieldDiffDeep(
        existingWorkspace,
        updatedWorkspace,
        fields,
      );

      await this.activitiesService.log({
        user: user,
        action: ActivityType.WORKSPACE_UPDATED,
        context: {
          workspaceId: updatedWorkspace.id,
          workspaceName: updatedWorkspace.name,
        },
        metadata: {
          fieldChanges: diff,
          workspaceId,
        },
        tx,
      });

      return updatedWorkspace;
    });
  }

  async findAllWhereMember(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: {
        workspace: {
          createdAt: 'asc',
        },
      },
    });

    return memberships.map((membership) => ({
      ...membership.workspace,
      role: membership.role,
    }));
  }

  async findAllCreatedByUser(creatorId: string) {
    return this.prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId: creatorId,
            role: WorkspaceRole.OWNER,
          },
        },
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(workspaceId: string, userId: string) {
    await this.validateUserIsMember(workspaceId, userId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
        // boards: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }
    return workspace;
  }

  async remove(workspaceId: string, user: User) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateUserRole(workspaceId, user.id, [WorkspaceRole.OWNER]);

      const workspaceToDelete = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspaceToDelete)
        throw new NotFoundException('Workspace not found.');

      await this.activitiesService.log({
        user: user,
        action: ActivityType.WORKSPACE_DELETED,
        context: {
          workspaceId: workspaceToDelete.id,
          workspaceName: workspaceToDelete.name,
        },
        metadata: {
          workspaceId: workspaceToDelete.id,
          workspaceName: workspaceToDelete.name,
          workspaceSlug: workspaceToDelete.slug,
        },
        tx,
      });

      await tx.workspace.delete({
        where: { id: workspaceId },
      });
    });
  }

  async validateUserRole(
    workspaceId: string,
    userId: string,
    allowedRoles: WorkspaceRole[],
  ) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('You are not a member of this workspace.');
    }

    if (!allowedRoles.includes(member.role)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return member;
  }

  async validateUserIsMember(
    workspaceId: string,
    userId: string,
    prismaClient?: Prisma.TransactionClient,
  ) {
    const client = prismaClient || this.prisma;

    const member = await client.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    });

    if (!member) {
      throw new NotFoundException(
        'Workspace not found or you are not a member.',
      );
    }

    return member;
  }

  private async _generateUniqueSlug(
    name: string,
    workspaceId?: string,
  ): Promise<string> {
    const baseSlug = name.toLowerCase().replace(/\s+/g, '-');
    let uniqueSlug = baseSlug;
    let counter = 0;

    while (true) {
      const existingWorkspace = await this.prisma.workspace.findUnique({
        where: { slug: uniqueSlug },
      });

      if (!existingWorkspace) {
        break;
      }

      if (existingWorkspace.id === workspaceId) {
        break;
      }

      const randomSuffix = Math.random().toString(36).substring(2, 6);
      uniqueSlug = `${baseSlug}-${randomSuffix}`;
      counter++;

      if (counter > 5) {
        throw new InternalServerErrorException(
          'Could not generate a unique slug.',
        );
      }
    }
    return uniqueSlug;
  }
}
