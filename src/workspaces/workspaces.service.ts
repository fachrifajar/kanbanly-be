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
  WorkspaceMember,
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
          workspaceName: newWorkspace.name,
          description: newWorkspace.description,
          workspaceId: newWorkspace.id,
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
    });

    const formattedWorkspaces = memberships.map((membership) => ({
      ...membership.workspace,

      userRole: membership.role,
      isOwner: membership.role === WorkspaceRole.OWNER,
    }));

    // 3. Lakukan sorting kustom di sini
    // Definisikan urutan prioritas peran
    const roleOrder = {
      [WorkspaceRole.OWNER]: 1,
      [WorkspaceRole.ADMIN]: 2,
      [WorkspaceRole.MEMBER]: 3,
      [WorkspaceRole.VIEWER]: 4,
    };

    formattedWorkspaces.sort((a, b) => {
      // Sortir pertama berdasarkan prioritas peran (OWNER paling atas)
      const roleComparison = roleOrder[a.userRole] - roleOrder[b.userRole];
      if (roleComparison !== 0) {
        return roleComparison;
      }

      // Jika perannya sama, sortir berdasarkan tanggal dibuat (terbaru paling atas)
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return formattedWorkspaces;
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
      const workspaceToDelete = (await this.validateUserRole(
        workspaceId,
        user.id,
        [WorkspaceRole.OWNER, WorkspaceRole.ADMIN],
        {
          selectWorkspace: {
            id: true,
            name: true,
            slug: true,
          },
        },
      )) as WorkspaceMember & {
        workspace: {
          id: string;
          name: string;
          slug: string;
        };
      };

      await this.activitiesService.log({
        user: user,
        action: ActivityType.WORKSPACE_DELETED,
        context: {
          workspaceId: workspaceToDelete?.workspace?.id,
          workspaceName: workspaceToDelete?.workspace.name,
        },
        metadata: {
          workspaceId: workspaceToDelete?.workspace?.id,
          workspaceName: workspaceToDelete?.workspace.name,
          workspaceSlug: workspaceToDelete?.workspace.slug,
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
    options?: {
      selectWorkspace?: Record<string, boolean>;
    },
  ) {
    const include = options?.selectWorkspace
      ? {
          workspace: {
            select: options.selectWorkspace,
          },
        }
      : undefined;

    const member = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
      include,
    });

    if (!member) {
      throw new NotFoundException(
        'You are not a member of this workspace or it does not exist.',
      );
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
