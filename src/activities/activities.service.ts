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
    const description = this._createDescription(user.username, action, context);

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
    username: string,
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
        return `${username} created ${workspace}`;
      case ActivityType.WORKSPACE_UPDATED:
        return `${username} updated ${workspace}`;
      case ActivityType.WORKSPACE_DELETED:
        return `${username} deleted ${workspace}`;

      // BOARD
      case ActivityType.BOARD_CREATED:
        return `${username} created ${board}`;
      case ActivityType.BOARD_UPDATED:
        return `${username} updated ${board}`;
      case ActivityType.BOARD_DELETED:
        return `${username} deleted ${board}`;
      case ActivityType.BOARD_ARCHIVED:
        return `${username} archived ${board}`;
      case ActivityType.BOARD_FAVORITED:
        return `${username} favorited ${board}`;
      case ActivityType.BOARD_UNFAVORITED:
        return `${username} unfavorited ${board}`;

      // LIST
      case ActivityType.LIST_CREATED:
        return `${username} created ${list} on ${board}`;
      case ActivityType.LIST_UPDATED:
        return `${username} updated ${list}`;
      case ActivityType.LIST_MOVED:
        return `${username} reordered lists on ${board}`;
      case ActivityType.LIST_DELETED:
        return `${username} deleted ${list}`;
      case ActivityType.LIST_ARCHIVED:
        return `${username} archived ${list}`;

      // CARD
      case ActivityType.CARD_CREATED:
        return `${username} created ${card} in ${list}`;
      case ActivityType.CARD_UPDATED:
        return `${username} updated ${card}`;
      case ActivityType.CARD_MOVED:
        return `${username} moved ${card} from list "${context.from || 'unknown'}" to "${context.to || 'unknown'}"`;
      case ActivityType.CARD_DELETED:
        return `${username} deleted ${card}`;
      case ActivityType.CARD_ARCHIVED:
        return `${username} archived ${card}`;
      case ActivityType.CARD_ASSIGNED:
        return `${username} assigned ${context.targetUserName || 'someone'} to ${card}`;
      case ActivityType.CARD_UNASSIGNED:
        return `${username} unassigned ${context.targetUserName || 'someone'} from ${card}`;

      // COMMENT
      case ActivityType.COMMENT_ADDED:
        return `${username} commented on ${card}`;

      // MEMBER
      case ActivityType.MEMBER_ADDED:
        return `${username} added ${context.targetUserName || 'someone'} to the workspace`;
      case ActivityType.MEMBER_REMOVED:
        return `${username} removed ${context.targetUserName || 'someone'} from the workspace`;

      // Default fallback
      default:
        return `${username} performed an action: ${action}`;
    }
  }
}
