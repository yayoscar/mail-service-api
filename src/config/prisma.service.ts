import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

// OAuth tokens are never returned unless a query explicitly asks for them
// with `omit: { accessToken: false, refreshToken: false }`.
const omitSecrets = {
  mailbox: { accessToken: true, refreshToken: true },
} as const;

type ClientOptions = { adapter: PrismaPg; omit: typeof omitSecrets };

@Injectable()
export class PrismaService
  extends PrismaClient<ClientOptions>
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg({ connectionString: configService.get<string>('DATABASE_URL') });
    super({ adapter, omit: omitSecrets });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
