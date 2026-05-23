import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateMailboxDto } from './dto/create-mailbox.dto';
import { UpdateMailboxDto } from './dto/update-mailbox.dto';

@Injectable()
export class MailboxesService {
  constructor(private prisma: PrismaService) {}

  async create(systemId: string, dto: CreateMailboxDto) {
    const system = await this.prisma.system.findUnique({ where: { id: systemId } });
    if (!system) throw new NotFoundException(`Sistema con id '${systemId}' no encontrado`);

    const existing = await this.prisma.mailbox.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException(`Ya existe un buzón con el email '${dto.email}'`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.mailbox.updateMany({
          where: { systemId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const mailbox = await tx.mailbox.create({
        data: {
          systemId,
          email: dto.email,
          displayName: dto.displayName,
          isDefault: dto.isDefault ?? false,
        },
      });

      return mailbox;
    });
  }

  async findBySystem(systemId: string) {
    return this.prisma.mailbox.findMany({
      where: { systemId, active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const mailbox = await this.prisma.mailbox.findUnique({ where: { id } });
    if (!mailbox) throw new NotFoundException(`Buzón con id '${id}' no encontrado`);
    return mailbox;
  }

  async update(id: string, dto: UpdateMailboxDto) {
    await this.findOne(id);

    if (dto.email) {
      const existing = await this.prisma.mailbox.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Ya existe un buzón con el email '${dto.email}'`);
      }
    }

    return this.prisma.mailbox.update({
      where: { id },
      data: dto,
    });
  }

  async deactivate(id: string) {
    const mailbox = await this.findOne(id);
    if (mailbox.isDefault) {
      throw new BadRequestException('No se puede desactivar el buzón por defecto del sistema');
    }
    return this.prisma.mailbox.update({
      where: { id },
      data: { active: false },
    });
  }

  async setDefault(id: string) {
    const mailbox = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      await tx.mailbox.updateMany({
        where: { systemId: mailbox.systemId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.mailbox.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  async findDefaultBySystemId(systemId: string) {
    return this.prisma.mailbox.findFirst({
      where: { systemId, isDefault: true, active: true },
    });
  }

  async findBySystemAndEmail(systemId: string, email: string) {
    return this.prisma.mailbox.findFirst({
      where: { systemId, email, active: true },
    });
  }
}
