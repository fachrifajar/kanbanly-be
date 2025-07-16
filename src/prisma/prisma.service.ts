import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    console.log('Successfully connected to the database.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Successfully disconnected from the database.');
  }
}
