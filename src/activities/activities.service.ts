import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityType, Prisma } from 'generated/prisma';
import { ActivityLogOptions } from './interface/activities.interface';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async log({ user, action, entity, context, tx }: ActivityLogOptions) {
    const description = this._createDescription(user.username, action, entity);
    const client = tx || this.prisma;

    const data: Prisma.ActivityCreateInput = {
      action,
      description,
      user: { connect: { id: user.id } },
    };

    if (action !== ActivityType.BOARD_DELETED && entity.boardId) {
      data.board = { connect: { id: entity.boardId } };
    } else if (
      action !== ActivityType.BOARD_DELETED &&
      entity.type === 'Board'
    ) {
      data.board = { connect: { id: entity.id } };
    }

    if (action === ActivityType.BOARD_DELETED) {
      data.metadata = {
        deletedBoardId: entity.id,
        deletedBoardName: entity.name,
        workspaceId: context?.workspaceId,
      };
    }

    return client.activity.create({ data });
  }

  private _createDescription(
    username: string,
    action: ActivityType,
    entity: ActivityLogOptions['entity'],
  ): string {
    const entityType = entity.type.toLowerCase();

    switch (action) {
      case ActivityType.WORKSPACE_CREATED:
      case ActivityType.BOARD_CREATED:
      case ActivityType.CARD_CREATED:
        return `${username} created ${entityType} "${entity.name}"`;
      case ActivityType.WORKSPACE_UPDATED:
      case ActivityType.BOARD_UPDATED:
      case ActivityType.CARD_UPDATED:
        return `${username} updated ${entityType} "${entity.name}"`;
      case ActivityType.WORKSPACE_DELETED:
      case ActivityType.BOARD_DELETED:
      case ActivityType.CARD_DELETED:
        return `${username} deleted ${entityType} "${entity.name}"`;
      default:
        return `An action was performed on ${entityType} "${entity.name}" by ${username}`;
    }
  }
}
