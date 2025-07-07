import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from 'generated/prisma';

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  async create(
    data: Prisma.ActivityCreateInput,
    prismaClient?: Prisma.TransactionClient,
  ) {
    const client = prismaClient || this.prisma;

    return client.activity.create({ data });
  }
}
