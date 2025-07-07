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
import { Prisma, WorkspaceRole } from 'generated/prisma';
import { ActivitiesService } from 'src/activities/activities.service';
import { User, ActivityType } from 'generated/prisma';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(createWorkspaceDto: CreateWorkspaceDto, user: User) {
    const existingWorkspaceWithName = await this.prisma.workspace.findFirst({
      where: {
        name: createWorkspaceDto.name,
        members: {
          some: {
            userId: user.id,
          },
        },
      },
    });

    // Jika ditemukan, lempar error
    if (existingWorkspaceWithName) {
      throw new ConflictException(
        'You already have a workspace with this name.',
      );
    }

    const slug = await this._generateUniqueSlug(createWorkspaceDto.name);

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: createWorkspaceDto.name,
          description: createWorkspaceDto.description,
          slug,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: WorkspaceRole.OWNER,
        },
      });

      await this.activitiesService.create(
        {
          action: ActivityType.WORKSPACE_CREATED,
          description: `${user.username} created workspace "${workspace.name}"`,
          user: { connect: { id: user.id } },
        },
        tx,
      );

      return workspace;
    });
  }

  async update(
    workspaceId: string,
    user: User,
    updateWorkspaceDto: UpdateWorkspaceDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this._validateUserRole(workspaceId, user.id, [
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
      ]);

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

      await this.activitiesService.create(
        {
          action: ActivityType.WORKSPACE_UPDATED,
          description: `${user.username} updated workspace "${updatedWorkspace.name}"`,
          user: { connect: { id: user.id } },
        },
        tx,
      );

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
    await this._validateUserIsMember(workspaceId, userId);

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
      await this._validateUserRole(workspaceId, user.id, [WorkspaceRole.OWNER]);

      const workspaceToDelete = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!workspaceToDelete)
        throw new NotFoundException('Workspace not found.');

      await tx.workspace.delete({
        where: { id: workspaceId },
      });

      await this.activitiesService.create(
        {
          action: ActivityType.WORKSPACE_DELETED,
          description: `${user.username} deleted workspace "${workspaceToDelete.name}"`,
          user: { connect: { id: user.id } },
        },
        tx,
      );
    });
  }

  private async _validateUserRole(
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

  private async _validateUserIsMember(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
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
