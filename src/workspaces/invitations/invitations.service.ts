import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkspacesService } from '../workspaces.service';
import { EmailService } from 'src/email/email.service';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { ActivitiesService } from 'src/activities/activities.service';
import {
  User,
  WorkspaceRole,
  ActivityType,
  WorkspaceMember,
  InvitationStatus,
} from '@prisma/client';
import * as crypto from 'crypto';

type InvitationLike = {
  id: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  token?: string;
};

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly emailService: EmailService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async create(
    workspaceId: string,
    inviter: User,
    inviteMemberDto: InviteMemberDto,
  ) {
    const existingWorkspace = (await this.workspacesService.validateUserRole(
      workspaceId,
      inviter.id,
      [WorkspaceRole.OWNER, WorkspaceRole.ADMIN],
      {
        selectWorkspace: {
          name: true,
        },
      },
    )) as WorkspaceMember & {
      workspace: {
        name: string;
        slug: string;
      };
    };

    const now = new Date();
    const conflict = {
      alreadyMember: [] as string[],
      alreadyInvited: [] as string[],
    };

    const memberMap = new Set<string>();
    const invitationMap = new Map<
      string,
      { id: string; status: string; expiresAt: Date }
    >();

    // Check all invitations without throwing directly
    for (const { email } of inviteMemberDto.invitations) {
      const [member, invitation] = await this.prisma.$transaction([
        this.prisma.workspaceMember.findFirst({
          where: { workspaceId, user: { email } },
        }),
        this.prisma.workspaceInvitation.findFirst({
          where: { workspaceId, email },
        }),
      ]);

      if (member) {
        conflict.alreadyMember.push(email);
        memberMap.add(email);
      }

      if (invitation) {
        invitationMap.set(email, {
          id: invitation.id,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
        });

        const isStillValid =
          ['PENDING', 'CONSUMED'].includes(invitation.status) &&
          invitation.expiresAt > now;
        if (isStillValid) conflict.alreadyInvited.push(email);
      }
    }

    // Throw after loop finishes (to check all emails)
    if (conflict.alreadyMember.length || conflict.alreadyInvited.length) {
      throw new ConflictException({
        message: 'Some emails cannot be invited',
        ...conflict,
      });
    }

    // Execute invite / refresh after no conflicts
    const result = {
      refreshed: [] as { email: string; token: string }[],
      invited: [] as { email: string; token: string }[],
      failedEmails: [] as string[],
    };
    let flag: 'refreshed' | 'invited';

    return this.prisma.$transaction(async (tx) => {
      for (const { email, role } of inviteMemberDto.invitations) {
        if (memberMap.has(email)) continue;

        const cached = invitationMap.get(email);
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 hari
        // const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 1 menit

        let invitation: {
          token: string;
        };

        // Token expired → refresh
        if (cached && cached.expiresAt < now) {
          invitation = await tx.workspaceInvitation.update({
            where: { id: cached.id },
            data: {
              token,
              expiresAt,
              status: 'PENDING',
              role,
              updatedAt: new Date(),
            },
          });
          result.refreshed.push({ email, token });
          flag = 'refreshed';
        } else {
          // Create new invitation
          invitation = await tx.workspaceInvitation.create({
            data: {
              email,
              role,
              token,
              invitedById: inviter.id,
              expiresAt,
              workspaceId,
            },
          });
          result.invited.push({ email, token });
          flag = 'invited';
        }

        // Send email
        try {
          await this.emailService.sendWorkspaceInvitationEmail(
            email,
            inviter.username ?? inviter.email,
            existingWorkspace.workspace.name,
            invitation.token,
          );
        } catch (error) {
          result.failedEmails.push(email);
        }

        await this.activitiesService.log({
          user: inviter,
          action:
            flag === 'refreshed'
              ? ActivityType.INVITATION_REFRESHED
              : ActivityType.INVITATION_SENT,
          context: {
            workspaceId,
            workspaceName: existingWorkspace.workspace.name,
            targetEmail: email,
            targetRole: role,
          },
          metadata: {
            receiverEmail: email,
            receiverRole: role,
            workspaceId,
            workspaceName: existingWorkspace.workspace.name,
            workspaceSlug: existingWorkspace.workspace.slug,
          },
          tx,
        });
      }

      return {
        message: 'Invitations successfully processed.',
        ...result,
      };
    });
  }

  async accept(token: string, user: User) {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Invitation is no longer valid.');
    }

    if (invitation.expiresAt < new Date()) {
      throw new ConflictException('Invitation has expired.');
    }

    if (invitation.email !== user.email) {
      throw new ForbiddenException(
        'This invitation is not intended for your account.',
      );
    }

    const alreadyMember = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: invitation.workspaceId,
        },
      },
    });

    if (alreadyMember) {
      throw new ConflictException(
        'You are already a member of this workspace.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: invitation.workspaceId,
          role: invitation.role,
        },
      });

      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'CONSUMED',
        },
      });

      await this.activitiesService.log({
        user,
        action: ActivityType.MEMBER_ADDED,
        context: {
          workspaceId: invitation.workspaceId,
          workspaceName: invitation.workspace.name,
          targetEmail: user.email,
        },
        metadata: {
          joinedFromInvitation: true,
          workspaceId: invitation.workspaceId,
          workspaceName: invitation.workspace.name,
          workspaceSlug: invitation.workspace.slug,
        },
        tx,
      });

      return {
        message: `You have successfully joined "${invitation.workspace.name}".`,
        data: {
          slug: invitation.workspace.slug,
          workspaceId: invitation.workspaceId,
          workspaceName: invitation.workspace.name,
        },
      };
    });
  }

  async findAll(
    workspaceId: string,
    user: User,
    sortBy: 'status' | 'asc' | 'desc' | 'role' = 'status',
  ) {
    await this.workspacesService.validateUserRole(workspaceId, user.id, [
      WorkspaceRole.ADMIN,
      WorkspaceRole.OWNER,
    ]);

    // Tandai yang expired
    await this.prisma.workspaceInvitation.updateMany({
      where: {
        workspaceId,
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { user: { select: { email: true } } },
    });

    const activeMemberEmails = new Set(members.map((m) => m.user.email));

    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: { workspaceId },
    });

    const owners = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, role: 'OWNER' },
      include: { user: true },
    });

    const ownerAsInvitations: InvitationLike[] = owners.map((owner) => ({
      id: `owner-${owner.userId}`,
      email: owner.user.email,
      role: 'OWNER',
      status: 'CONSUMED',
      createdAt: owner.createdAt,
      updatedAt: owner.updatedAt,
      expiresAt: null,
    }));

    const otherInvitations: InvitationLike[] = invitations
      .filter((inv) => {
        if (inv.status === 'CANCELLED') return false;
        if (inv.status !== 'CONSUMED') return true;
        return activeMemberEmails.has(inv.email); // CONSUMED, tapi masih member
      })
      .map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role as InvitationLike['role'],
        status: inv.status as InvitationLike['status'],
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        expiresAt: inv.expiresAt,
        token: inv.token,
      }));

    const combined: InvitationLike[] = [...otherInvitations];

    // Sort logic
    if (sortBy === 'status') {
      const statusOrder = {
        CONSUMED: 0,
        PENDING: 1,
        EXPIRED: 2,
      };
      combined.sort((a, b) => {
        const aOrder = statusOrder[a.status] ?? 99;
        const bOrder = statusOrder[b.status] ?? 99;
        return aOrder - bOrder;
      });
    } else if (sortBy === 'asc') {
      combined.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } else if (sortBy === 'desc') {
      combined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else if (sortBy === 'role') {
      const roleOrder = { ADMIN: 1, MEMBER: 2, VIEWER: 3 };
      combined.sort((a, b) => {
        const aOrder = roleOrder[a.role as keyof typeof roleOrder] ?? 99;
        const bOrder = roleOrder[b.role as keyof typeof roleOrder] ?? 99;
        return aOrder - bOrder;
      });
    }

    return [...ownerAsInvitations, ...combined];
  }

  async cancelOrRemove(workspaceId: string, user: User, email: string) {
    const validateWorkspace = (await this.workspacesService.validateUserRole(
      workspaceId,
      user.id,
      [WorkspaceRole.ADMIN, WorkspaceRole.OWNER],
      {
        selectWorkspace: { name: true },
      },
    )) as WorkspaceMember & {
      workspace: { name: string };
    };

    if (user.email === email) {
      throw new BadRequestException('You cannot remove yourself.');
    }

    const existingMember = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        user: { email },
        role: { not: WorkspaceRole.OWNER },
      },
      include: {
        user: { select: { email: true, id: true } },
      },
    });

    if (existingMember) {
      await this.prisma.$transaction([
        this.prisma.workspaceMember.delete({
          where: { id: existingMember.id },
        }),
        this.prisma.workspaceInvitation.updateMany({
          where: {
            workspaceId,
            email,
            status: 'CONSUMED',
          },
          data: { status: 'CANCELLED' },
        }),
      ]);

      await this.activitiesService.log({
        user,
        action: ActivityType.MEMBER_REMOVED,
        context: {
          workspaceId,
          workspaceName: validateWorkspace.workspace.name,
          targetEmail: existingMember.user.email,
        },
        metadata: {
          workspaceId,
          workspaceName: validateWorkspace.workspace.name,
          targetEmail: existingMember.user.email,
        },
      });

      return { message: 'Member removed and invitation status updated.' };
    }

    // kalau belum jadi member
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: {
        workspaceId,
        email,
        status: { in: ['PENDING', 'EXPIRED'] },
        role: { not: WorkspaceRole.OWNER },
      },
    });

    if (invitation) {
      await this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: 'CANCELLED' },
      });

      await this.activitiesService.log({
        user,
        action: ActivityType.INVITATION_CANCELED,
        context: {
          workspaceId,
          workspaceName: validateWorkspace.workspace.name,
          targetEmail: invitation.email,
        },
        metadata: {
          workspaceId,
          workspaceName: validateWorkspace.workspace.name,
          targetEmail: invitation.email,
        },
      });

      return { message: 'Invitation canceled.' };
    }

    throw new NotFoundException('Member or invitation not found.');
  }

  async validateToken(token: string) {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { token },
      include: { workspace: true },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    const isExpired = invitation.expiresAt < new Date();
    if (isExpired) throw new BadRequestException('Invitation token expired.');

    if (invitation.status === 'CONSUMED') {
      throw new ConflictException('Invitation already used.');
    }

    return {
      email: invitation.email,
      workspace: invitation.workspace.name,
      role: invitation.role,
    };
  }
}
