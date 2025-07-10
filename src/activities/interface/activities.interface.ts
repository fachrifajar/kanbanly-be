import { User, ActivityType, Prisma } from '@prisma/client';

interface LogEntity {
  boardId?: string;
  id: string;
  name: string;
  type: 'Workspace' | 'Board' | 'Card' | 'List';
}

export interface ActivityLogOptions {
  user: User;
  action: ActivityType;
  entity: LogEntity;
  tx?: Prisma.TransactionClient;
  context?: { workspaceId?: string };
}
