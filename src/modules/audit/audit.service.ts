import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { QueryEmailLogDto } from './dto/query-email-log.dto';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryEmailLogDto) {
    const { status, systemId, page = 1, limit = 20 } = query;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (systemId) where.systemId = systemId;

    const [data, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        include: {
          system: { select: { id: true, key: true, name: true } },
          mailbox: { select: { id: true, email: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    return this.prisma.emailLog.findUnique({
      where: { id },
      include: {
        system: { select: { id: true, key: true, name: true } },
        mailbox: { select: { id: true, email: true, displayName: true } },
      },
    });
  }
}
