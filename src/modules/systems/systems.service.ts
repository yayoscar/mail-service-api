import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class SystemsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSystemDto) {
    const existing = await this.prisma.system.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Ya existe un sistema con la key '${dto.key}'`);
    }

    const plainApiKey = `sk-${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = await bcrypt.hash(plainApiKey, 10);

    const system = await this.prisma.system.create({
      data: { key: dto.key, name: dto.name, apiKeyHash },
    });

    const { apiKeyHash: _, ...result } = system;
    return { ...result, apiKey: plainApiKey };
  }

  async findAll() {
    const systems = await this.prisma.system.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return systems.map(({ apiKeyHash: _, ...s }) => s);
  }

  async findOne(id: string) {
    const system = await this.prisma.system.findUnique({ where: { id } });
    if (!system) throw new NotFoundException(`Sistema con id '${id}' no encontrado`);
    const { apiKeyHash: _, ...result } = system;
    return result;
  }

  async update(id: string, dto: UpdateSystemDto) {
    await this.findOne(id);
    const system = await this.prisma.system.update({
      where: { id },
      data: dto,
    });
    const { apiKeyHash: _, ...result } = system;
    return result;
  }

  async regenerateApiKey(id: string) {
    await this.findOne(id);

    const plainApiKey = `sk-${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = await bcrypt.hash(plainApiKey, 10);

    await this.prisma.system.update({
      where: { id },
      data: { apiKeyHash },
    });

    return {
      message: 'API Key regenerada exitosamente. Guárdela, no se volverá a mostrar.',
      apiKey: plainApiKey,
      systemId: id,
    };
  }

  async findById(id: string) {
    return this.prisma.system.findUnique({ where: { id } });
  }
}
