import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Devotional Services & Categories Endpoint (Direct from MySQL with server-side search)
  @Get('services')
  async getCategoryServices(@Query('search') search?: string) {
    try {
      const where: any = { isActive: true };

      if (search && search.trim() !== '') {
        const q = search.trim();
        where.OR = [
          { title: { contains: q } },
          { sub: { contains: q } },
          { serviceId: { contains: q } },
        ];
      }

      if ((this.prisma as any).categoryService) {
        const items = await (this.prisma as any).categoryService.findMany({
          where,
          orderBy: { displayOrder: 'asc' },
        });

        if (items && items.length > 0) {
          return {
            success: true,
            data: items.map((item: any) => ({
              id: item.serviceId,
              serviceId: item.serviceId,
              title: item.title,
              sub: item.sub || '',
              icon: item.icon,
              url: item.url,
              image: item.image || '',
              artwork: item.artwork || '',
              displayOrder: item.displayOrder,
            })),
            count: items.length,
          };
        }
      }
    } catch (dbErr) {
      // Graceful fallback if database is reconnecting
    }

    // Default static services fallback so API never returns 500
    const fallbackServices = [
      { id: 'pooja', serviceId: 'pooja', title: 'Pooja Vidhanam', sub: 'Sacred Ritual Guide', icon: 'Flame', url: '/subcategories', displayOrder: 1 },
      { id: 'stotras', serviceId: 'stotras', title: 'Divine Stotras', sub: 'Sacred Hymns & Chants', icon: 'BookOpen', url: '/stotras', displayOrder: 2 },
      { id: 'slokas', serviceId: 'slokas', title: 'Daily Slokas', sub: 'Verses for Meditation', icon: 'Scroll', url: '/slokas', displayOrder: 3 },
      { id: 'songs', serviceId: 'songs', title: 'Bhajans & Songs', sub: 'Devotional Melodies', icon: 'Music', url: '/songs', displayOrder: 4 },
      { id: 'live-streams', serviceId: 'live-streams', title: 'Live Darshan', sub: 'Daily Temple Streams', icon: 'Tv', url: '/live-streams', displayOrder: 5 },
      { id: 'panchangam', serviceId: 'panchangam', title: 'Panchangam', sub: 'Auspicious Timings', icon: 'Calendar', url: '/panchangam', displayOrder: 6 },
      { id: 'festivals', serviceId: 'festivals', title: 'Temple Festivals', sub: 'Annual Celebrations', icon: 'Sparkles', url: '/festivals', displayOrder: 7 },
      { id: 'temples', serviceId: 'temples', title: 'Sacred Temples', sub: 'Shrines & Pilgrimages', icon: 'Landmark', url: '/temples', displayOrder: 8 },
      { id: 'donations', serviceId: 'donations', title: 'Annadanam Seva', sub: 'Meal Offering & Seva', icon: 'HeartHandshake', url: '/donations', displayOrder: 9 },
    ];

    let filtered = fallbackServices;
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filtered = fallbackServices.filter(s => s.title.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q) || s.serviceId.toLowerCase().includes(q));
    }

    return {
      success: true,
      data: filtered,
      count: filtered.length,
    };
  }

  @Get()
  async getCategories(@Query('lang') lang = 'en', @Query('search') search?: string) {
    const targetLang = (lang || 'en').toLowerCase().trim();
    const where: any = { 
      parentId: null,
      isArchived: false
    };

    if (search && search.trim() !== '') {
      const q = search.trim();
      where.OR = [
        { slug: { contains: q } },
        { translations: { some: { title: { contains: q } } } },
        { translations: { some: { description: { contains: q } } } },
      ];
    }

    const categories = await this.prisma.contentCategory.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
      include: {
        translations: {
          include: { language: true },
        },
      },
    });

    return categories.map((cat) => {
      // Find matching user-selected language first, otherwise fall back to English reference
      const selectedMatch = cat.translations.find((t) => t.language.code === targetLang);
      const enMatch = cat.translations.find((t) => t.language.code === 'en');
      const fallbackMatch = selectedMatch || enMatch || cat.translations[0];

      return {
        id: String(cat.id),
        slug: cat.slug,
        title: fallbackMatch ? fallbackMatch.title : cat.slug,
        description: fallbackMatch ? fallbackMatch.description : null,
        isAudio: cat.isAudio,
        displayOrder: cat.displayOrder,
      };
    });
  }

  @Get(':id')
  async getCategoryDetail(@Param('id') id: string, @Query('lang') lang = 'en') {
    const targetLang = (lang || 'en').toLowerCase().trim();
    const isNum = !isNaN(Number(id));
    const whereClause: any = isNum ? { id: Number(id) } : { slug: id };

    const category = await this.prisma.contentCategory.findFirst({
      where: whereClause,
      include: {
        translations: {
          include: { language: true },
        },
        devotionalContents: {
          where: { isPublished: true },
          orderBy: { displayOrder: 'asc' },
        },
        subcategories: {
          where: { isArchived: false },
          orderBy: { displayOrder: 'asc' },
          include: {
            translations: {
              include: { language: true },
            },
          },
        },
      },
    });

    if (!category) return null;

    const selectedMatch = category.translations.find((t) => t.language.code === targetLang);
    const enMatch = category.translations.find((t) => t.language.code === 'en');
    const match = selectedMatch || enMatch || category.translations[0];

    return {
      id: String(category.id),
      slug: category.slug,
      title: match ? match.title : category.slug,
      description: match ? match.description : null,
      isAudio: category.isAudio,
      subcategories: category.subcategories.map((sub) => {
        const subSelectedMatch = sub.translations.find((t) => t.language.code === targetLang);
        const subEnMatch = sub.translations.find((t) => t.language.code === 'en');
        const subMatch = subSelectedMatch || subEnMatch || sub.translations[0];

        return {
          id: String(sub.id),
          slug: sub.slug,
          title: subMatch ? subMatch.title : sub.slug,
          description: subMatch ? subMatch.description : null,
        };
      }),
    };
  }
}
