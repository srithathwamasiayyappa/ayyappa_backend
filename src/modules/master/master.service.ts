import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MasterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch 12 Rashis with localized names
   */
  async getRashis(lang = 'te') {
    const language = await this.prisma.language.findUnique({
      where: { code: lang },
    });
    const langId = language ? language.id : 1;

    const rashis = await this.prisma.rashi.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        translations: {
          where: { languageId: langId },
        },
      },
    });

    return rashis.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.translations[0]?.name || r.code,
      sortOrder: r.sortOrder,
    }));
  }

  /**
   * Fetch 27 Nakshatras with localized names
   */
  async getNakshatras(lang = 'te') {
    const language = await this.prisma.language.findUnique({
      where: { code: lang },
    });
    const langId = language ? language.id : 1;

    const nakshatras = await this.prisma.nakshatra.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        translations: {
          where: { languageId: langId },
        },
      },
    });

    return nakshatras.map((n) => ({
      id: n.id,
      code: n.code,
      name: n.translations[0]?.name || n.code,
      sortOrder: n.sortOrder,
    }));
  }
}

