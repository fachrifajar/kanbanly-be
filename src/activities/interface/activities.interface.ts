import { ActivityType, Prisma } from '@prisma/client';

export interface ActivityContext {
  workspaceId: string;
  workspaceName?: string;
  boardId?: string;
  boardName?: string;
  listId?: string;
  listName?: string;
  cardId?: string;
  cardTitle?: string;
  from?: string;
  to?: string;
  targetUserName?: string;
  labelName?: string;
  attachmentName?: string;
}

export interface ActivityLogOptions {
  user: {
    id: string;
    username: string;
  };
  action: ActivityType;
  context: ActivityContext;
  metadata?: Record<string, any>;
  tx?: Prisma.TransactionClient;
}
