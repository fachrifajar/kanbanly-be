import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityType, Prisma, Activity } from '@prisma/client';
import {
  ActivityContext,
  ActivityLogOptions,
} from './interface/activities.interface';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async log({
    user,
    action,
    context,
    metadata,
    tx,
  }: ActivityLogOptions): Promise<Activity> {
    const description = this._createDescription(user.email, action, context);

    const client: Prisma.TransactionClient | PrismaService = tx || this.prisma;

    const data: Prisma.ActivityCreateInput = {
      action,
      description,
      user: { connect: { id: user.id } },
      workspace: context.workspaceId
        ? { connect: { id: context.workspaceId } }
        : undefined,
      board: context.boardId ? { connect: { id: context.boardId } } : undefined,
      card: context.cardId ? { connect: { id: context.cardId } } : undefined,
      metadata: metadata ?? undefined,
    };

    return await client.activity.create({ data });
  }

  private _createDescription(
    email: string,
    action: ActivityType,
    context: ActivityContext,
  ): string {
    const card = context.cardTitle ? `card "${context.cardTitle}"` : 'a card';
    const list = context.listName ? `list "${context.listName}"` : 'a list';
    const board = context.boardName
      ? `board "${context.boardName}"`
      : 'a board';
    const workspace = context.workspaceName
      ? `workspace "${context.workspaceName}"`
      : 'a workspace';

    switch (action) {
      // WORKSPACE
      case ActivityType.WORKSPACE_CREATED:
        return `${email} created ${workspace}`;
      case ActivityType.WORKSPACE_UPDATED:
        return `${email} updated ${workspace}`;
      case ActivityType.WORKSPACE_DELETED:
        return `${email} deleted ${workspace}`;

      // BOARD
      case ActivityType.BOARD_CREATED:
        return `${email} created ${board}`;
      case ActivityType.BOARD_UPDATED:
        return `${email} updated ${board}`;
      case ActivityType.BOARD_DELETED:
        return `${email} deleted ${board}`;
      case ActivityType.BOARD_ARCHIVED:
        return `${email} archived ${board}`;
      case ActivityType.BOARD_FAVORITED:
        return `${email} favorited ${board}`;
      case ActivityType.BOARD_UNFAVORITED:
        return `${email} unfavorited ${board}`;

      // LIST
      case ActivityType.LIST_CREATED:
        return `${email} created ${list} on ${board}`;
      case ActivityType.LIST_UPDATED:
        return `${email} updated ${list}`;
      case ActivityType.LIST_MOVED:
        return `${email} reordered lists on ${board}`;
      case ActivityType.LIST_DELETED:
        return `${email} deleted ${list}`;
      case ActivityType.LIST_ARCHIVED:
        return `${email} archived ${list}`;

      // CARD
      case ActivityType.CARD_CREATED:
        return `${email} created ${card} in ${list}`;
      case ActivityType.CARD_UPDATED:
        return `${email} updated ${card}`;
      case ActivityType.CARD_MOVED:
        return `${email} moved ${card} from list "${context.from || 'unknown'}" to "${context.to || 'unknown'}"`;
      case ActivityType.CARD_DELETED:
        return `${email} deleted ${card}`;
      case ActivityType.CARD_ARCHIVED:
        return `${email} archived ${card}`;
      case ActivityType.CARD_ASSIGNED:
        return `${email} assigned ${context.targetEmail || 'someone'} to ${card}`;
      case ActivityType.CARD_UNASSIGNED:
        return `${email} unassigned ${context.targetEmail || 'someone'} from ${card}`;

      // COMMENT
      case ActivityType.COMMENT_ADDED:
        return `${email} commented on ${card}`;

      // MEMBER
      case ActivityType.MEMBER_ADDED:
        return `${context.targetEmail || 'someone'} joined the workspace`;
      case ActivityType.MEMBER_REMOVED:
        return `${email} removed ${context.targetEmail || 'someone'} from the workspace`;
      case ActivityType.MEMBER_ROLE_CHANGED:
        return `${email} changed ${context.targetEmail || 'someone'}'s role to ${context.targetRole}`;

      // INVITATION
      case ActivityType.INVITATION_SENT:
        return `${email} invited ${context.targetEmail || 'someone'} to the workspace`;
      case ActivityType.INVITATION_REFRESHED:
        return `${email} refreshed the invitation ${context.targetEmail} to join the workspace`;
      case ActivityType.INVITATION_CANCELED:
        return `${email} canceled the invitation ${context.targetEmail} to join the workspace`;

      // Default fallback
      default:
        return `${email} performed an action: ${action}`;
    }
  }
}
