import { Controller, Get, Post, Put, Param, Query, Body, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

function resolveCategoryDeity(slug: string = '', title: string = '') {
  const s = `${slug} ${title}`.toLowerCase();
  if (/ayyap|sastha|harivarasanam|shabarimala|uthara|sannidhanam|padi|maaladharan|sharanu/.test(s)) {
    return { deityId: 'ayyappa', deityName: 'Lord Ayyappa' };
  }
  if (/shiva|linga|bilva|rudra|natara|mrityunjaya/.test(s)) {
    return { deityId: 'shiva', deityName: 'Lord Shiva' };
  }
  if (/venkates|vishnu|koodalmanikya|achyuta|govinda|narayana|perumal/.test(s)) {
    return { deityId: 'venkateswara', deityName: 'Lord Venkateswara' };
  }
  if (/ganesh|vignesh|vinayak|ganapath|modak/.test(s)) {
    return { deityId: 'ganesha', deityName: 'Lord Ganesha' };
  }
  if (/devi|durga|lakshmi|lalitha|kanakadhara|mahalakshmi|meenakshi|kamakshi|saraswathi|gomatha/.test(s)) {
    return { deityId: 'devi', deityName: 'Goddess Lakshmi / Durga' };
  }
  if (/hanuman|anjaneya|maruti|bajrang|sundarakanda/.test(s)) {
    return { deityId: 'hanuman', deityName: 'Lord Hanuman' };
  }
  if (/subrahmanya|murugan|kartikeya|saravana|shanmukha|vel|skanda/.test(s)) {
    return { deityId: 'murugan', deityName: 'Lord Murugan' };
  }
  return { deityId: 'all', deityName: 'All Deities' };
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Devotional Services & Categories Endpoint (Direct from MySQL with server-side search and multi-language support)
  @Get('services')
  async getCategoryServices(@Query('search') search?: string, @Query('lang') lang?: string) {
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
              artwork: item.artwork || '',
              displayOrder: item.displayOrder,
              isActive: item.isActive ?? true,
            })),
            count: items.length,
          };
        }
      }

      // Check dynamic app_settings for category_services
      const setting = await this.prisma.appSetting.findUnique({
        where: { key: 'category_services' }
      });
      if (setting && setting.value) {
        try {
          const parsed = JSON.parse(setting.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            let filtered = parsed;
            if (search && search.trim() !== '') {
              const q = search.trim().toLowerCase();
              filtered = parsed.filter((s: any) => s.title?.toLowerCase().includes(q) || s.sub?.toLowerCase().includes(q) || s.serviceId?.toLowerCase().includes(q));
            }
            return {
              success: true,
              data: filtered,
              count: filtered.length
            };
          }
        } catch {}
      }
    } catch (dbErr) {
      // Graceful fallback if database is reconnecting
    }

    // Default static services fallback matching the official website & mobile API specification
    const fallbackServices = [
      { id: 'pooja', serviceId: 'pooja', title: 'Pooja Vidhanam', sub: 'Step-by-step sacred rituals', icon: 'Flame', url: '/subcategories', artwork: '/images/categories/art-pooja-trans.png', displayOrder: 1, isActive: true },
      { id: 'stotras', serviceId: 'stotras', title: 'Divine Stotras', sub: 'Sacred Hymns & Chants', icon: 'BookOpen', url: '/stotras', artwork: '/images/categories/art-stotras-trans.png', displayOrder: 2, isActive: true },
      { id: 'slokas', serviceId: 'slokas', title: 'Daily Slokas', sub: 'Verses for Meditation', icon: 'Scroll', url: '/slokas', artwork: '/images/categories/art-slokas-trans.png', displayOrder: 3, isActive: true },
      { id: 'songs', serviceId: 'songs', title: 'Bhajans & Songs', sub: 'Devotional Melodies', icon: 'Music', url: '/songs', artwork: '/images/categories/art-bhajans-trans.png', displayOrder: 4, isActive: true },
      { id: 'live-streams', serviceId: 'live-streams', title: 'Live Darshan', sub: 'Daily Temple Streams', icon: 'Tv', url: '/live-streams', artwork: '/images/categories/art-live-trans.png', displayOrder: 5, isActive: true },
      { id: 'panchangam', serviceId: 'panchangam', title: 'Panchangam', sub: 'Auspicious Timings', icon: 'Calendar', url: '/panchangam', artwork: '/images/categories/art-panchangam-trans.png', displayOrder: 6, isActive: true },
      { id: 'festivals', serviceId: 'festivals', title: 'Temple Festivals', sub: 'Annual Celebrations', icon: 'Sparkles', url: '/festivals', artwork: '/images/categories/art-stotras-trans.png', displayOrder: 7, isActive: true },
      { id: 'temples', serviceId: 'temples', title: 'Sacred Temples', sub: 'Shrines & Pilgrimages', icon: 'Landmark', url: '/temples', artwork: '/images/categories/art-temples-trans.png', displayOrder: 8, isActive: true },
      { id: 'donations', serviceId: 'donations', title: 'Annadanam Seva', sub: 'Meal Offering & Seva', icon: 'HeartHandshake', url: '/donations', artwork: '/images/categories/art-donations-trans.png', displayOrder: 9, isActive: true },
    ];

    // Multi-language localization map
    const serviceI18n: Record<string, Record<string, { title: string; sub: string }>> = {
      pooja: {
        te: { title: 'పూజా విధానం', sub: 'దశలవారీ పూజా పద్ధతులు & నియమాలు' },
        kn: { title: 'ಪೂಜಾ ವಿಧಾನ', sub: 'ಹಂತ-ಹಂತದ ಪೂಜಾ ವಿಧಾನಗಳು' },
        ta: { title: 'பூஜை முறை', sub: 'படி படியான பூஜை முறைகள்' },
        hi: { title: 'पूजा विधान', sub: 'चरण-दर-चरण पूजा पद्धतियां' },
      },
      stotras: {
        te: { title: 'దివ్య స్తోత్రాలు', sub: 'శక్తివంతమైన భక్తి స్తోత్రాలు' },
        kn: { title: 'ದಿವ್ಯ ಸ್ತೋತ್ರಗಳು', sub: 'ಶಕ್ತಿಶಾಲಿ ಭಕ್ತಿ ಸ್ತೋತ್ರಗಳು' },
        ta: { title: 'தெய்வீக ஸ்தோத்திரங்கள்', sub: 'சக்திவாய்ந்த பக்தி துதிகள்' },
        hi: { title: 'दिव्य स्तोत्र', sub: 'पावन भक्ति स्तोत्र' },
      },
      slokas: {
        te: { title: 'నిత్య శ్లోకాలు', sub: 'ధ్యాన శ్లోకాలు & అర్థాలు' },
        kn: { title: 'ನಿತ್ಯ ಶ್ಲೋಕಗಳು', sub: 'ಧ್ಯಾನ ಶ್ಲೋಕಗಳು & ಅರ್ಥಗಳು' },
        ta: { title: 'தினசரி ஸ்லோகங்கள்', sub: 'தியான ஸ்லோகங்கள் & பொருள்' },
        hi: { title: 'दैनिक श्लोक', sub: 'ध्यान श्लोक और अर्थ' },
      },
      songs: {
        te: { title: 'భజనలు & కీర్తనలు', sub: 'భక్తి గీతాలు & హారతులు' },
        kn: { title: 'ಭಜನೆಗಳು & ಕೀರ್ತನೆಗಳು', sub: 'ಭಕ್ತಿಗೀತೆಗಳು & ಆರತಿಗಳು' },
        ta: { title: 'பஜனைகள் & பாடல்கள்', sub: 'பக்திப் பாடல்கள் & ஆரத்திகள்' },
        hi: { title: 'भजन और कीर्तन', sub: 'भक्ति गीत और आरतियां' },
      },
      'live-streams': {
        te: { title: 'ప్రత్యక్ష దర్శనం', sub: 'ఆలయ ప్రత్యక్ష ప్రసారాలు' },
        kn: { title: 'ನೇರ ದರ್ಶನ', sub: 'ದೇವಾಲಯ ನೇರ ಪ್ರಸಾರಗಳು' },
        ta: { title: 'நேரலை தரிசனம்', sub: 'கோயில் நேரலை ஒளிபரப்புகள்' },
        hi: { title: 'लाइव दर्शन', sub: 'मंदिर सीधा प्रसारण' },
      },
      panchangam: {
        te: { title: 'నిత్య పంచాంగం', sub: 'తిథి, నక్షత్రం & శుభ ముహూర్తాలు' },
        kn: { title: 'ದೈನಂದಿನ ಪಂಚಾಂಗ', sub: 'ತಿಥಿ, ನಕ್ಷತ್ರ & ಶುಭ ಮುಹೂರ್ತ' },
        ta: { title: 'தினசரி பஞ்சாங்கம்', sub: 'திதி, நட்சத்திரம் & சுப முகூர்த்தம்' },
        hi: { title: 'दैनिक पंचांग', sub: 'तिथि, नक्षत्र और शुभ मुहूर्त' },
      },
      festivals: {
        te: { title: 'ఆలయ పండుగలు', sub: 'వార్షిక ఉత్సవాలు & విశేషాలు' },
        kn: { title: 'ದೇವಾಲಯ ಹಬ್ಬಗಳು', sub: 'ವಾರ್ಷಿಕ ಹಬ್ಬಗಳು & ವಿಶೇಷಗಳು' },
        ta: { title: 'கோயில் திருவிழாக்கள்', sub: 'ஆண்டு விழாக்கள் & சிறப்புகள்' },
        hi: { title: 'मंदिर उत्सव', sub: 'वार्षिक उत्सव और व्रत' },
      },
      temples: {
        te: { title: 'పవిత్ర దేవాలయాలు', sub: 'పుణ్యక్షేత్రాలు & తీర్థయాత్రలు' },
        kn: { title: 'ಪವಿತ್ರ ದೇವಾಲಯಗಳು', sub: 'ಪುಣ್ಯಕ್ಷೇತ್ರಗಳು & ಯಾತ್ರೆಗಳು' },
        ta: { title: 'புனித திருக்கோயில்கள்', sub: 'திருத்தலங்கள் & யாத்திரைகள்' },
        hi: { title: 'पवित्र मंदिर', sub: 'तीर्थ स्थल और देवालय' },
      },
      donations: {
        te: { title: 'అన్నదాన సేవ', sub: 'నిత్యాన్నదానం & సేవా సహకారం' },
        kn: { title: 'ಅನ್ನದಾನ ಸೇವೆ', sub: 'ನಿತ್ಯಾನ್ನದಾನ & ಸೇವಾ ಸಹಕಾರ' },
        ta: { title: 'அன்னதான சேவை', sub: 'அன்னதானம் & சேவைப் பங்களிப்பு' },
        hi: { title: 'अन्नदान सेवा', sub: 'महाप्रसाद एवं सेवा सहयोग' },
      },
    };

    let localizedServices = fallbackServices;
    if (lang && lang !== 'en' && serviceI18n) {
      localizedServices = fallbackServices.map((s) => {
        const trans = serviceI18n[s.serviceId]?.[lang];
        if (trans) {
          return {
            ...s,
            title: trans.title,
            sub: trans.sub,
          };
        }
        return s;
      });
    }

    let filtered = localizedServices;
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filtered = localizedServices.filter(s => s.title.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q) || s.serviceId.toLowerCase().includes(q));
    }

    return {
      success: true,
      data: filtered,
      count: filtered.length,
    };
  }

  // 1b. Devotional Service By ID Endpoint
  @Get('services/:id')
  async getCategoryServiceById(@Param('id') id: string) {
    const list = await this.getCategoryServices();
    const service = list.data.find((s: any) => s.id === id || s.serviceId === id);
    if (!service) {
      return {
        success: false,
        statusCode: 404,
        message: `Devotional service '${id}' not found.`
      };
    }
    return {
      success: true,
      data: service
    };
  }

  @Get()
  async getCategories(@Query('lang') lang = 'en', @Query('search') search?: string) {
    const targetLang = (lang || 'en').toLowerCase().trim();

    try {
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

      if (categories && categories.length > 0) {
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
    } catch (dbErr) {
      console.warn('[Categories] Database connection unavailable, serving default categories catalog:', dbErr);
    }

    // Default categories seed catalog so the API NEVER throws HTTP 500
    const seedCategories = [
      { id: '1', slug: 'pooja-vidhanam', title: targetLang === 'te' ? 'పూజా విధానం' : 'Pooja Vidhanam', description: 'Complete step-by-step pooja guides and vidhis', isAudio: false, displayOrder: 1 },
      { id: '2', slug: 'astothrams', title: targetLang === 'te' ? 'అష్టోత్తరాలు' : 'Astothrams', description: '108 Sacred Names & Namavalis for daily worship', isAudio: false, displayOrder: 2 },
      { id: '3', slug: 'slokas', title: targetLang === 'te' ? 'శ్లోకాలు' : 'Slokas', description: 'Divine verses and mantras for peace and prosperity', isAudio: false, displayOrder: 3 },
      { id: '4', slug: 'bhajans', title: targetLang === 'te' ? 'భజనలు & కీర్తనలు' : 'Bhajans & Songs', description: 'Soul-stirring devotional songs and keerthanas', isAudio: true, displayOrder: 4 },
      { id: '5', slug: 'vrata-kalpam', title: targetLang === 'te' ? 'వ్రత కల్పం' : 'Vrata Kalpam', description: 'Ayyappa Mandala Deeksha Vrata rules and rituals', isAudio: false, displayOrder: 5 },
      { id: '6', slug: 'harivarasanam', title: targetLang === 'te' ? 'హరివరాసనం' : 'Harivarasanam', description: 'Sacred lullaby sung at Sabarimala temple closing', isAudio: true, displayOrder: 6 },
      { id: '7', slug: 'sahasranama', title: targetLang === 'te' ? 'సహస్రనామావళి' : 'Sahasranamavali', description: '1008 Holy names of Lord Ayyappa', isAudio: false, displayOrder: 7 },
      { id: '8', slug: 'kavacham', title: targetLang === 'te' ? 'శ్రీ అయ్యప్ప కవచం' : 'Ayyappa Kavacham', description: 'Protective divine armour chant', isAudio: false, displayOrder: 8 },
    ];

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      return seedCategories.filter(c => c.title.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
    }
    return seedCategories;
  }

  // 1b. Stotras Public API List (filtered by published, parent stotras/slogans, Telugu first)
  @Get('stotras')
  async getStotras(
    @Query('lang') lang = 'te',
    @Query('search') search?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('deity') deity?: string
  ) {
    const targetLang = (lang || 'te').toLowerCase().trim();
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * take;

    try {
      // Find parent category for stotras (id 4 or slug slogans-of-sri-ayyappa-swami / stotras)
      const parentCat = await this.prisma.contentCategory.findFirst({
        where: {
          OR: [
            { id: 4 },
            { slug: 'slogans-of-sri-ayyappa-swami' },
            { slug: 'stotras' }
          ]
        }
      });

      const parentId = parentCat ? parentCat.id : 4;

      const where: any = {
        parentId: parentId,
        isArchived: false,
      };

      if (search && search.trim() !== '') {
        const q = search.trim();
        where.AND = [
          {
            OR: [
              { slug: { contains: q } },
              { translations: { some: { title: { contains: q } } } }
            ]
          }
        ];
      }

      const [totalRecords, items] = await Promise.all([
        this.prisma.contentCategory.count({ where }),
        this.prisma.contentCategory.findMany({
          where,
          skip,
          take,
          orderBy: { displayOrder: 'asc' },
          include: {
            translations: { include: { language: true } },
            devotionalContents: {
              where: { isPublished: true },
              orderBy: { displayOrder: 'asc' }
            }
          }
        })
      ]);

      const data = items.map((cat, idx) => {
        const preferred = cat.translations.find((t: any) => t.language?.code === targetLang) || cat.translations.find((t: any) => t.language?.code === 'te') || cat.translations[0];
        const titleFormatted = cat.slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        const devContent = cat.devotionalContents[0];
        const verseCount = devContent && devContent.sacredText ? devContent.sacredText.split(/\n\s*\n/).length : 0;

        return {
          id: String(cat.id),
          slug: cat.slug,
          title: preferred?.title || titleFormatted,
          description: preferred?.description || '',
          deityName: preferred?.title?.includes('శివ') ? 'శివుడు' : preferred?.title?.includes('వేంకటేశ') ? 'శ్రీ వేంకటేశ్వర స్వామి' : preferred?.title?.includes('వాసవీ') ? 'వాసవీ కన్యకా పరమేశ్వరి' : 'సర్వ దేవతలు',
          verseCount: verseCount || (devContent ? 5 : 0),
          isPublished: devContent ? devContent.isPublished : true,
          displayOrder: cat.displayOrder,
          imageUrl: `/images/subcategories/stotras/${cat.slug}.webp`,
          badge: 'Stotra',
          updatedAt: cat.updatedAt
        };
      });

      return {
        success: true,
        data,
        meta: {
          page: pageNum,
          limit: take,
          totalRecords,
          totalPages: Math.ceil(totalRecords / take)
        }
      };
    } catch (err) {
      console.warn('[Categories] getStotras error:', err);
      return { success: false, data: [], meta: { page: 1, limit: take, totalRecords: 0, totalPages: 0 } };
    }
  }

  // 1b-detail. Stotra Detail API by slug or ID
  @Get('stotras/:slugOrId')
  async getStotraDetail(
    @Param('slugOrId') slugOrId: string,
    @Query('lang') lang = 'te'
  ) {
    const targetLang = (lang || 'te').toLowerCase().trim();
    const isNum = !isNaN(Number(slugOrId));
    const whereClause: any = isNum ? { id: Number(slugOrId) } : { slug: slugOrId };

    try {
      const category = await this.prisma.contentCategory.findFirst({
        where: whereClause,
        include: {
          translations: { include: { language: true } },
          devotionalContents: {
            where: { isPublished: true },
            orderBy: { displayOrder: 'asc' }
          }
        }
      });

      if (category) {
        const preferred = category.translations.find((t: any) => t.language?.code === targetLang) || category.translations.find((t: any) => t.language?.code === 'te') || category.translations[0];
        const devContent = category.devotionalContents[0];

        return {
          success: true,
          data: {
            id: String(category.id),
            slug: category.slug,
            title: preferred?.title || category.slug,
            introduction: preferred?.description || '',
            description: preferred?.description || '',
            sacredText: devContent?.sacredText || '',
            meaning: devContent?.meaning || '',
            displayOrder: category.displayOrder,
            isPublished: devContent?.isPublished ?? true,
            imageUrl: `/images/subcategories/stotras/${category.slug}.webp`
          }
        };
      }
    } catch (err) {
      console.warn('[Categories] getStotraDetail error:', err);
    }

    return { success: false, message: 'Stotra not found' };
  }

  // 1c. Devotional Subcategories Endpoint (Direct from MySQL with parent, deity, search & server-side filter)
  @Get('subcategories')
  async getSubcategories(
    @Query('parent') parent?: string,
    @Query('parentId') parentId?: string,
    @Query('lang') lang = 'en',
    @Query('search') search?: string,
    @Query('deity') deity?: string,
    @Query('filter') filter?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100'
  ) {
    const parentKey = parent || parentId;
    const targetLang = (lang || 'en').toLowerCase().trim();

    try {
      let targetParentCondition: any = { not: null };

      if (parentKey && parentKey !== 'all') {
        const parsed = parseInt(parentKey, 10);
        if (!isNaN(parsed) && parsed > 0) {
          targetParentCondition = parsed;
        } else {
          const orClauses: any[] = [
            { slug: parentKey },
            { slug: parentKey.toLowerCase() },
            { translations: { some: { title: { contains: parentKey } } } }
          ];
          const lower = parentKey.toLowerCase();
          if (lower === 'stotras' || lower === 'stotra' || lower === 'stotramulu') {
            orClauses.push({ id: 4 });
            orClauses.push({ slug: 'slogans-of-sri-ayyappa-swami' });
          }
          if (lower === 'slokas' || lower === 'sloka') {
            orClauses.push({ id: 115 });
            orClauses.push({ slug: 'slokas' });
          }
          if (lower === 'pooja' || lower === 'poojas') {
            orClauses.push({ id: 17 });
            orClauses.push({ slug: 'poojalu-vrathaalu' });
          }

          const parentMatch = await this.prisma.contentCategory.findFirst({
            where: { OR: orClauses }
          });
          if (parentMatch) {
            targetParentCondition = parentMatch.id;
          }
        }
      }

      const where: any = {
        parentId: targetParentCondition,
        isArchived: false,
      };

      const items = await this.prisma.contentCategory.findMany({
        where,
        orderBy: { displayOrder: 'asc' },
        include: {
          parent: { include: { translations: { include: { language: true } } } },
          translations: { include: { language: true } },
          devotionalContents: { select: { id: true, title: true, isPublished: true } }
        }
      });

      if (items && items.length > 0) {
        let customImages: Record<string, string> = {};
        try {
          const imgSetting = await this.prisma.appSetting.findUnique({ where: { key: 'subcategory_images' } });
          if (imgSetting && imgSetting.value) customImages = JSON.parse(imgSetting.value);
        } catch (_) {}

        let mappedItems = items.map(cat => {
          const preferred = cat.translations.find((t: any) => t.language?.code === targetLang) || cat.translations[0];
          const parentPref = cat.parent?.translations?.find((t: any) => t.language?.code === targetLang) || cat.parent?.translations?.[0];
          const pSlug = cat.parent?.slug || 'slokas';
          const customImg = customImages[String(cat.id)] || customImages[cat.slug];

          const titleFormatted = cat.slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          const finalTitle = (preferred?.title && preferred.title !== cat.slug) ? preferred.title : titleFormatted;
          const deityResolved = resolveCategoryDeity(cat.slug, finalTitle);

          // Dedicated high-resolution card artwork resolution
          let resolvedImage = customImg;
          if (!resolvedImage) {
            const s = cat.slug.toLowerCase();
            if (s.includes('shiva-linga') || s.includes('simple') || s.includes('nithyapooja')) resolvedImage = '/images/pooja/pooja-card-1-ref.png';
            else if (s.includes('subramanya') || s.includes('murugan')) resolvedImage = '/images/pooja/pooja-card-2-ref.png';
            else if (s.includes('mantrapushpam') || s.includes('sharanu') || s.includes('slogans')) resolvedImage = '/images/pooja/pooja-card-3-ref.png';
            else if (s.includes('harathi') || s.includes('deepa')) resolvedImage = '/images/pooja/pooja-card-4-ref.png';
            else if (s.includes('ganapa') || s.includes('vignesh') || s.includes('gomatha')) resolvedImage = '/images/pooja/pooja-card-5-ref.png';
            else if (s.includes('abhisheka') || s.includes('koodalmanikya') || s.includes('bilva')) resolvedImage = '/images/pooja/pooja-card-6-ref.png';
            else if (deityResolved.deityId === 'ayyappa') resolvedImage = '/images/pooja/card-banner-ayyappa-hd.png';
            else if (deityResolved.deityId === 'ganesha') resolvedImage = '/images/pooja/card-banner-ganapathi-hd.png';
            else if (deityResolved.deityId === 'devi') resolvedImage = '/images/pooja/card-banner-lakshmi-hd.png';
            else if (deityResolved.deityId === 'venkateswara') resolvedImage = '/images/pooja/pooja-card-3-ref.png';
            else if (deityResolved.deityId === 'hanuman') resolvedImage = '/images/pooja/pooja-card-4-ref.png';
            else {
              const cardRefs = [
                '/images/pooja/pooja-card-1-ref.png',
                '/images/pooja/pooja-card-2-ref.png',
                '/images/pooja/pooja-card-3-ref.png',
                '/images/pooja/pooja-card-4-ref.png',
                '/images/pooja/pooja-card-5-ref.png',
                '/images/pooja/pooja-card-6-ref.png'
              ];
              resolvedImage = cardRefs[cat.displayOrder % cardRefs.length] || '/images/pooja/pooja-card-1-ref.png';
            }
          }

          // Step count / verse count resolution based on ritual complexity
          let stepsCount = '12 Steps';
          const s = cat.slug.toLowerCase();
          if (s.includes('simple') || s.includes('nithya')) stepsCount = '16 Steps';
          else if (s.includes('subramanya')) stepsCount = '18 Steps';
          else if (s.includes('mantra')) stepsCount = '8 Steps';
          else if (s.includes('harathi')) stepsCount = '5 Steps';
          else if (s.includes('ganapa')) stepsCount = '12 Steps';
          else if (s.includes('abhisheka')) stepsCount = '21 Steps';
          else if (s.includes('ashtottara')) stepsCount = '108 Names';
          else if (s.includes('sahasranama')) stepsCount = '1000 Names';
          else if (s.includes('dasakam')) stepsCount = '10 Stanzas';
          else if (s.includes('stotra') || s.includes('sloka')) stepsCount = '8 Verses';
          else if (pSlug === 'songs') stepsCount = 'Song & Lyrics';

          // Badge tag resolution (Daily / Beginner / Festival / Popular)
          let badgeTag = 'Daily';
          let badgeClass = 'badge-daily';
          if (s.includes('mandala') || s.includes('makara') || s.includes('vratham')) {
            badgeTag = 'Festival';
            badgeClass = 'badge-festival';
          } else if (s.includes('simple') || s.includes('pratha') || s.includes('bhojana') || s.includes('poorvaangamu')) {
            badgeTag = 'Beginner';
            badgeClass = 'badge-beginner';
          } else if (s.includes('harivarasanam') || s.includes('lingashtakam') || s.includes('vishnu-sahasra') || s.includes('kanakadhara')) {
            badgeTag = 'Popular';
            badgeClass = 'badge-popular';
          }

          return {
            id: String(cat.id),
            slug: cat.slug,
            title: finalTitle,
            desc: preferred?.description || '',
            description: preferred?.description || '',
            parentId: cat.parentId,
            parentSlug: pSlug,
            parentTitle: parentPref ? parentPref.title : pSlug,
            displayOrder: cat.displayOrder,
            isAudio: cat.isAudio,
            imageUrl: resolvedImage,
            image: resolvedImage,
            duration: '10 minutes',
            stepsCount,
            badge: badgeTag,
            badgeClass,
            filterTag: badgeTag,
            deityId: deityResolved.deityId,
            deityName: deityResolved.deityName,
            type: cat.isAudio ? 'Audio / Bhajan' : (pSlug === 'pooja' ? 'Pooja' : pSlug === 'stotras' ? 'Stotra' : pSlug === 'slokas' ? 'Sloka' : 'Song')
          };
        });

        // 1. Server-side Deity Filtering
        if (deity && deity !== 'all') {
          const normDeity = deity.toLowerCase().replace(/^(lord-|goddess-)/, '');
          mappedItems = mappedItems.filter(item => {
            const itemD = (item.deityId || '').toLowerCase().replace(/^(lord-|goddess-)/, '');
            return itemD === normDeity || itemD === 'all';
          });
        }

        // 2. Server-side Search Filtering
        if (search && search.trim() !== '') {
          const q = search.trim().toLowerCase();
          mappedItems = mappedItems.filter(item => {
            return (
              item.title.toLowerCase().includes(q) ||
              item.desc.toLowerCase().includes(q) ||
              item.slug.toLowerCase().includes(q) ||
              item.deityName.toLowerCase().includes(q)
            );
          });
        }

        // 3. Server-side Category / Badge Filter (All, Beginner, Festival, Daily, Popular)
        if (filter && filter !== 'All') {
          mappedItems = mappedItems.filter(item => {
            if (filter === 'Popular') {
              return item.badge === 'Popular' || item.filterTag === 'Popular';
            }
            return item.badge === filter || item.filterTag === filter;
          });
        }

        // 4. Server-side Pagination
        const total = mappedItems.length;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 100);
        const paginatedItems = mappedItems.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        return {
          success: true,
          data: paginatedItems,
          total,
          count: paginatedItems.length,
          page: pageNum,
          limit: limitNum
        };
      }
    } catch (err) {
      console.warn('[Categories] getSubcategories error:', err);
    }

    return {
      success: true,
      data: [],
      total: 0,
      count: 0
    };
  }

  // 1c-detail. Devotional Subcategory Detail Endpoint
  @Get('subcategories/:slugOrId')
  async getSubcategoryDetail(
    @Param('slugOrId') slugOrId: string,
    @Query('lang') lang = 'en',
    @Query('god') god?: string
  ) {
    const targetLang = (lang || 'en').toLowerCase().trim();
    const isNum = !isNaN(Number(slugOrId));

    // Resolve aliases (nithyapooja <-> nithya-pooja-laghu-vidhanam <-> daily-pooja)
    let lookupSlug = slugOrId;
    if (slugOrId === 'nithya-pooja-laghu-vidhanam' || slugOrId === 'daily-pooja' || slugOrId === 'nitya-pooja') {
      lookupSlug = 'nithyapooja';
    }

    const orWhere: any[] = [];
    if (isNum) orWhere.push({ id: Number(slugOrId) });
    orWhere.push({ slug: slugOrId });
    if (lookupSlug !== slugOrId) orWhere.push({ slug: lookupSlug });
    if (slugOrId.includes('nithya')) {
      orWhere.push({ slug: 'nithyapooja' });
      orWhere.push({ slug: 'nithya-pooja-laghu-vidhanam' });
    }

    try {
      let category = await this.prisma.contentCategory.findFirst({
        where: { OR: orWhere },
        include: {
          parent: {
            include: {
              translations: { include: { language: true } }
            }
          },
          translations: { include: { language: true } },
          devotionalContents: {
            where: { isPublished: true },
            orderBy: { displayOrder: 'asc' }
          }
        }
      });

      // If not in Prisma DB yet, fallback to backup_ayyappa_audit.json
      let auditCatMatch: any = null;
      try {
        const auditPath = path.join(process.cwd(), 'backup_ayyappa_audit.json');
        if (fs.existsSync(auditPath)) {
          const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
          auditCatMatch = audit.categories?.find((c: any) =>
            c.slug === slugOrId ||
            c.slug === lookupSlug ||
            (slugOrId.includes('nithya') && c.slug === 'nithyapooja') ||
            (isNum && c.id === Number(slugOrId))
          );
        }
      } catch (_) {}

      if (category || auditCatMatch) {
        const preferred = category?.translations?.find((t: any) => t.language?.code === targetLang) || category?.translations?.[0];
        const teTranslation = category?.translations?.find((t: any) => t.language?.code === 'te');
        const enTranslation = category?.translations?.find((t: any) => t.language?.code === 'en');
        const parentPref = category?.parent?.translations?.find((t: any) => t.language?.code === targetLang) || category?.parent?.translations?.[0];
        const pSlug = category?.parent?.slug || 'pooja';

        const rawSlug = category?.slug || auditCatMatch?.slug || slugOrId;
        const titleFormatted = rawSlug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

        let auditLangId = targetLang === 'te' ? 1 : targetLang === 'kn' ? 2 : targetLang === 'ta' ? 4 : targetLang === 'hi' ? 5 : 3;
        const auditTrans = auditCatMatch?.translations?.find((t: any) => t.languageId === auditLangId) || auditCatMatch?.translations?.[0];

        const finalTitle = preferred?.title || auditTrans?.title || titleFormatted;
        const finalTeTitle = teTranslation?.title || (auditCatMatch?.translations?.find((t: any) => t.languageId === 1)?.title) || finalTitle;
        const finalEnTitle = enTranslation?.title || (auditCatMatch?.translations?.find((t: any) => t.languageId === 3)?.title) || titleFormatted;

        const deityResolved = resolveCategoryDeity(rawSlug, finalTitle);

        // Fetch custom image or assign dedicated artwork
        let customImages: Record<string, string> = {};
        try {
          const imgSetting = await this.prisma.appSetting.findUnique({ where: { key: 'subcategory_images' } });
          if (imgSetting && imgSetting.value) customImages = JSON.parse(imgSetting.value);
        } catch (_) {}

        let resolvedImage = customImages[String(category?.id)] || customImages[rawSlug];
        if (!resolvedImage) {
          const s = rawSlug.toLowerCase();
          if (s.includes('shiva-linga') || s.includes('simple') || s.includes('nithya')) resolvedImage = '/images/pooja/pooja-card-1-ref.png';
          else if (s.includes('subramanya') || s.includes('murugan')) resolvedImage = '/images/pooja/pooja-card-2-ref.png';
          else if (s.includes('mantrapushpam') || s.includes('sharanu') || s.includes('slogans')) resolvedImage = '/images/pooja/pooja-card-3-ref.png';
          else if (s.includes('harathi') || s.includes('deepa')) resolvedImage = '/images/pooja/pooja-card-4-ref.png';
          else if (s.includes('ganapa') || s.includes('vignesh') || s.includes('gomatha')) resolvedImage = '/images/pooja/pooja-card-5-ref.png';
          else if (s.includes('abhisheka') || s.includes('koodalmanikya') || s.includes('bilva')) resolvedImage = '/images/pooja/pooja-card-6-ref.png';
          else if (deityResolved.deityId === 'ayyappa') resolvedImage = '/images/pooja/card-banner-ayyappa-hd.png';
          else if (deityResolved.deityId === 'ganesha') resolvedImage = '/images/pooja/card-banner-ganapathi-hd.png';
          else if (deityResolved.deityId === 'devi') resolvedImage = '/images/pooja/card-banner-lakshmi-hd.png';
          else resolvedImage = '/images/pooja/pooja-card-1-ref.png';
        }

        // Full scripture text (contains the complete, authentic Telugu slokas & mantras)
        let fullScriptureText = preferred?.description || auditTrans?.description || '';

        // Extract instruction note if present
        let instructionNote = '';
        if (fullScriptureText.includes('సూచన :') || fullScriptureText.includes('సూచన:')) {
          const parts = fullScriptureText.split(/\n\s*\n/);
          instructionNote = parts[0].replace(/^సూచన\s*:\s*/, '').trim();
        }

        // Process procedure steps and mantras
        const procedure: Array<{ step: number; title: string; desc: string; mantra?: string }> = [];
        const mantras: Array<{ title: string; script: string; transliteration: string; meaning: string }> = [];

        if (category?.devotionalContents && category.devotionalContents.length > 0) {
          category.devotionalContents.forEach((dc: any) => {
            if (dc.sacredText) {
              const sections = dc.sacredText.split(/(?=\[\s*[^\]]+\s*\])/g).filter(Boolean);
              if (sections.length > 1) {
                sections.forEach((sec: string, sIdx: number) => {
                  const headerMatch = sec.match(/\[\s*([^\]]+)\s*\]/);
                  const secTitle = headerMatch ? headerMatch[1].trim() : `Step ${sIdx + 1}`;
                  const secBody = sec.replace(/\[\s*[^\]]+\s*\]/, '').trim();
                  procedure.push({
                    step: procedure.length + 1,
                    title: secTitle,
                    desc: `Recite and perform with devotion:`,
                    mantra: secBody
                  });
                  mantras.push({
                    title: secTitle,
                    script: secBody,
                    transliteration: '',
                    meaning: dc.meaning || 'Sacred verse with divine blessing.'
                  });
                });
              } else {
                procedure.push({
                  step: procedure.length + 1,
                  title: dc.title || `Sacred Chanting Step`,
                  desc: dc.meaning || `Chant the divine mantras with pure heart.`,
                  mantra: dc.sacredText
                });
                mantras.push({
                  title: dc.title || `Maha Mantra`,
                  script: dc.sacredText,
                  transliteration: '',
                  meaning: dc.meaning || 'Sacred verse.'
                });
              }
            }
          });
        }

        // Default procedures if none parsed
        if (procedure.length === 0) {
          procedure.push(
            { step: 1, title: 'Shuddi & Deeparadhana', desc: 'Bathe with cold water, apply Vibhuti and Chandanam, light deepam with pure sesame or ghee.', mantra: 'ఓం దీపజ్యోతిః పరబ్రహ్మ దీపజ్యోతిర్జనార్దనః | దీపో హరతు మే పాపం సంధ్యాదీప నమోస్తుతే ||' },
            { step: 2, title: 'Prarthana & Sankalpam', desc: 'Make the solemn sankalpam for spiritual purity, family well-being, and divine protection.', mantra: 'శుక్లాంబరధరం విష్ణుం శశివర్ణం చతుర్భుజమ్ | ప్రసన్నవదనం ధ్యాయేత్ సర్వవిఘ్నోపశాంతయే ||' },
            { step: 3, title: 'Sacred Pooja & Samarpanam', desc: 'Perform the holy offerings, flowers, naivedyam, and conclude with mangala harathi.', mantra: 'స్వామియే శరణం అయ్యప్ప | శ్రీ గురుభ్యో నమః' }
          );
        }

        if (mantras.length === 0) {
          mantras.push({
            title: `${finalTitle} Sacred Sloka`,
            script: 'శుక్లాంబరధరం విష్ణుం శశివర్ణం చతుర్భుజమ్ |\nప్రసన్నవదనం ధ్యాయేత్ సర్వవిఘ్నోపశాంతయే ||\n\nసరస్వతీ నమస్తుభ్యం వరదే కామరూపిణీ |\nవిద్యారంభం కరిష్యామి సిద్ధిర్భవతు మే సదా ||',
            transliteration: 'Suklambaradharam Vishnum Sasivarnam Chaturbhujam | Prasannavadanam Dhyayet Sarvavighnopasantaye ||',
            meaning: preferred?.description || 'Divine prayers dedicated to your chosen deity.'
          });
        }

        // Resolve child subcategories (for deities with multiple types, e.g. Mahaganapathi 4 types)
        let children: any[] = [];
        const catId = category?.id || auditCatMatch?.id;

        try {
          if (catId) {
            const dbChildren = await this.prisma.contentCategory.findMany({
              where: { parentId: catId },
              include: { translations: { include: { language: true } } },
              orderBy: { displayOrder: 'asc' }
            });
            if (dbChildren && dbChildren.length > 0) {
              children = dbChildren.map((ch: any) => {
                const chPref = ch.translations?.find((t: any) => t.language?.code === targetLang) || ch.translations?.[0];
                return {
                  id: String(ch.id),
                  slug: ch.slug,
                  title: chPref?.title || ch.slug,
                  imageUrl: '/images/deities/card_ganesha.jpg'
                };
              });
            }
          }
        } catch (_) {}

        if (children.length === 0 && auditCatMatch) {
          try {
            const auditPath = path.join(process.cwd(), 'backup_ayyappa_audit.json');
            if (fs.existsSync(auditPath)) {
              const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
              const auditChildren = audit.categories?.filter((c: any) => c.parentId === auditCatMatch.id || (auditCatMatch.id === 6 && c.parentId === 6));
              if (auditChildren && auditChildren.length > 0) {
                children = auditChildren.map((ch: any) => {
                  const chTrans = ch.translations?.find((t: any) => t.languageId === auditLangId) || ch.translations?.[0];
                  return {
                    id: String(ch.id),
                    slug: ch.slug,
                    title: chTrans?.title || ch.slug,
                    imageUrl: '/images/deities/card_ganesha.jpg'
                  };
                });
              }
            }
          } catch (_) {}
        }

        if (children.length === 0 && (rawSlug.includes('ganapa') || rawSlug.includes('vignesh') || rawSlug === 'ganapathi-pooja')) {
          try {
            const auditPath = path.join(process.cwd(), 'backup_ayyappa_audit.json');
            if (fs.existsSync(auditPath)) {
              const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
              const auditChildren = audit.categories?.filter((c: any) => c.parentId === 6);
              if (auditChildren && auditChildren.length > 0) {
                children = auditChildren.map((ch: any) => {
                  const chTrans = ch.translations?.find((t: any) => t.languageId === auditLangId) || ch.translations?.[0];
                  return {
                    id: String(ch.id),
                    slug: ch.slug,
                    title: chTrans?.title || ch.slug,
                    imageUrl: '/images/deities/card_ganesha.jpg'
                  };
                });
              }
            }
          } catch (_) {}
        }

        return {
          success: true,
          data: {
            id: rawSlug,
            rawId: category?.id || auditCatMatch?.id,
            slug: rawSlug,
            category: pSlug,
            parentSlug: pSlug,
            parentTitle: parentPref?.title || pSlug,
            title: finalTitle,
            titleTelugu: finalTeTitle,
            titleEnglish: finalEnTitle,
            subtitle: preferred?.description?.slice(0, 150) || `Complete sacred vidhanam, procedure and verses for ${finalTitle}.`,
            overview: preferred?.description?.slice(0, 300) || `Sacred worship procedure and divine blessings for ${finalTitle}.`,
            fullScriptureText,
            instructionNote,
            heroImage: resolvedImage,
            badge: 'Daily Devotion',
            badgeClass: 'badge-daily',
            duration: '15 mins',
            difficulty: 'All Devotees',
            bestTime: 'Morning (Pratah Kalam) or Evening (Sandhya)',
            deityId: deityResolved.deityId,
            deityName: deityResolved.deityName,
            deityTelugu: deityResolved.deityId === 'ayyappa' ? 'శ్రీ అయ్యప్ప స్వామి' : deityResolved.deityId === 'shiva' ? 'పరమశివుడు' : deityResolved.deityId === 'ganesha' ? 'శ్రీ మహాగణపతి' : deityResolved.deityId === 'devi' ? 'శ్రీ దేవి అమ్మవారు' : deityResolved.deityId === 'murugan' ? 'శ్రీ సుబ్రహ్మణ్యేశ్వర స్వామి' : deityResolved.deityId === 'venkateswara' ? 'శ్రీ వేంకటేశ్వర స్వామి' : 'సర్వ దేవతలు',
            children,
            procedure,
            materials: [
              { name: 'Pure Cow Ghee / Sesame Oil for Deepam', qty: '100 ml', icon: 'Flame' },
              { name: 'Fresh Cotton Wicks (Vattulu)', qty: '1 Packet', icon: 'Sparkles' },
              { name: 'Pure Vibhuti, Kumkum & Sandalwood (Gandham)', qty: '50g each', icon: 'Flower2' },
              { name: 'Fresh Fragrant Flowers & Thulasi / Bilva Leaves', qty: '1 Basket', icon: 'Flower2' },
              { name: 'Raw Coconuts & Betel Leaves with Supari', qty: '2 Coconuts, 5 Betel Leaves', icon: 'Layers' },
              { name: 'Raw Rice with Turmeric (Akshintalu)', qty: '1 Bowl', icon: 'Sparkles' },
              { name: 'Fresh Fruits or Naivedyam Prasad', qty: '1 Bowl', icon: 'Soup' },
              { name: 'Pure Camphor (Karpooram) & Dhoop Sticks', qty: '1 Box', icon: 'Flame' }
            ],
            mantras,
            benefits: [
              'Brings profound peace of mind and destroys negative vibrations.',
              'Instills spiritual strength, health, discipline and family harmony.',
              'Neutralizes planetary doshams and brings auspicious beginnings.',
              'Bestows benevolent divine protection of the presiding deity.'
            ],
            audioTrack: {
              title: `${finalTitle} Devotional Audio`,
              duration: '05:30',
              ragam: 'Madhyamavathi'
            }
          }
        };
      }
    } catch (err) {
      console.warn('[Categories] getSubcategoryDetail error:', err);
    }

    return {
      success: false,
      message: `Subcategory ${slugOrId} not found`
    };
  }

  // 1d. Store Subcategory Image Endpoint
  @Post('subcategories/:id/image')
  async storeSubcategoryImage(
    @Param('id') id: string,
    @Body() body: { imageUrl: string }
  ) {
    if (!body?.imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }

    let customImages: Record<string, string> = {};
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'subcategory_images' } });
    if (setting && setting.value) {
      try {
        customImages = JSON.parse(setting.value);
      } catch (_) {}
    }

    customImages[id] = body.imageUrl;

    await this.prisma.appSetting.upsert({
      where: { key: 'subcategory_images' },
      create: { key: 'subcategory_images', value: JSON.stringify(customImages) },
      update: { value: JSON.stringify(customImages) }
    });

    return {
      success: true,
      message: `Image stored successfully for subcategory ${id}`,
      data: { id, imageUrl: body.imageUrl }
    };
  }

  // 1e. Batch Store Images Endpoint
  @Put('subcategories/images')
  async storeBatchImages(@Body() body: { images: Record<string, string> }) {
    if (!body?.images || typeof body.images !== 'object') {
      throw new BadRequestException('images object mapping is required');
    }

    let customImages: Record<string, string> = {};
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'subcategory_images' } });
    if (setting && setting.value) {
      try {
        customImages = JSON.parse(setting.value);
      } catch (_) {}
    }

    Object.assign(customImages, body.images);

    await this.prisma.appSetting.upsert({
      where: { key: 'subcategory_images' },
      create: { key: 'subcategory_images', value: JSON.stringify(customImages) },
      update: { value: JSON.stringify(customImages) }
    });

    return {
      success: true,
      message: 'Subcategory images stored successfully',
      count: Object.keys(customImages).length,
      data: customImages
    };
  }

  // 1f. View Seed Data Endpoint
  @Get('seed-data')
  async getSeedData(@Query('parent') parent?: string) {
    const where: any = { parentId: { not: null } };
    if (parent) {
      where.parent = { slug: parent };
    }

    const [subcategories, translationsCount, devotionalContentsCount, languages] = await Promise.all([
      this.prisma.contentCategory.findMany({
        where,
        orderBy: { displayOrder: 'asc' },
        include: {
          parent: { select: { id: true, slug: true } },
          translations: { select: { id: true, title: true, description: true, language: { select: { code: true, name: true } } } },
          devotionalContents: { select: { id: true, slug: true, title: true, isPublished: true } }
        }
      }),
      this.prisma.contentTranslation.count(),
      this.prisma.devotionalContent.count(),
      this.prisma.language.findMany()
    ]);

    return {
      success: true,
      message: 'Seed data retrieved successfully from DB',
      data: {
        totalSubcategories: subcategories.length,
        translationsCount,
        devotionalContentsCount,
        languages,
        subcategories: subcategories.map(s => ({
          id: s.id,
          slug: s.slug,
          parentSlug: s.parent?.slug,
          displayOrder: s.displayOrder,
          translations: s.translations.map(t => ({ lang: t.language.code, title: t.title })),
          devotionalContentsCount: s.devotionalContents?.length || 0
        }))
      }
    };
  }

  // Direct convenience endpoints for target pages:
  @Get('pooja-vidhanam')
  async getPoojaVidhanam(
    @Query('lang') lang = 'en',
    @Query('search') search?: string,
    @Query('deity') deity?: string
  ) {
    return this.getSubcategories('pooja', undefined, lang, search, deity);
  }

  @Get('slokas')
  async getSlokas(
    @Query('lang') lang = 'en',
    @Query('search') search?: string,
    @Query('deity') deity?: string
  ) {
    return this.getSubcategories('slokas', undefined, lang, search, deity);
  }

  @Get('bhajans')
  async getBhajans(
    @Query('lang') lang = 'en',
    @Query('search') search?: string,
    @Query('deity') deity?: string
  ) {
    return this.getSubcategories('songs', undefined, lang, search, deity);
  }

  @Get('deities')
  async getDeitiesList(@Query('lang') lang = 'en') {
    const list = [
      { id: 'ayyappa', slug: 'lord-ayyappa', name: 'Lord Ayyappa', image: '/images/deities/lord_ayyappa.png', isActive: true, sortOrder: 1 },
      { id: 'shiva', slug: 'lord-shiva', name: 'Lord Shiva', image: '/images/deities/lord_shiva.png', isActive: true, sortOrder: 2 },
      { id: 'venkateswara', slug: 'lord-venkateswara', name: 'Lord Venkateswara', image: '/images/deities/lord_vishnu.png', isActive: true, sortOrder: 3 },
      { id: 'ganesha', slug: 'lord-ganesha', name: 'Lord Ganesha', image: '/images/deities/lord_ganesha.png', isActive: true, sortOrder: 4 },
      { id: 'devi', slug: 'goddess-lakshmi-durga', name: 'Goddess Lakshmi / Durga', image: '/images/deities/goddess_devi.png', isActive: true, sortOrder: 5 },
      { id: 'hanuman', slug: 'lord-hanuman', name: 'Lord Hanuman', image: '/images/deities/hanuman.jpg', isActive: true, sortOrder: 6 },
      { id: 'murugan', slug: 'lord-murugan', name: 'Lord Murugan', image: '/images/deities/lord_murugan.png', isActive: true, sortOrder: 7 },
      { id: 'all', slug: 'all-deities', name: 'All Deities', image: '/images/deities/saranam_deity_emblem.png', isActive: true, sortOrder: 8 },
    ];
    return { success: true, data: list };
  }

  @Get(':id')
  async getCategoryDetail(@Param('id') id: string, @Query('lang') lang = 'en') {
    const targetLang = (lang || 'en').toLowerCase().trim();
    const isNum = !isNaN(Number(id));
    const whereClause: any = isNum ? { id: Number(id) } : { slug: id };

    let category: any = null;
    try {
      category = await this.prisma.contentCategory.findFirst({
        where: whereClause,
        include: {
          parent: {
            include: {
              translations: {
                include: { language: true },
              },
            },
          },
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
    } catch (err) {
      console.warn('[Categories] getCategoryDetail DB query error:', err);
    }

    if (category) {
      const selectedMatch = category.translations.find((t: any) => t.language?.code === targetLang);
      const enMatch = category.translations.find((t: any) => t.language?.code === 'en');
      const match = selectedMatch || enMatch || category.translations[0];

      const parentMatch = category.parent?.translations?.find((t: any) => t.language?.code === targetLang) || category.parent?.translations?.[0];
      const pSlug = category.parent?.slug;

      let customImg = '';
      try {
        const imgSetting = await this.prisma.appSetting.findUnique({ where: { key: 'subcategory_images' } });
        if (imgSetting && imgSetting.value) {
          const map = JSON.parse(imgSetting.value);
          customImg = map[String(category.id)] || map[category.slug] || '';
        }
      } catch (_) {}

      return {
        id: String(category.id),
        slug: category.slug,
        title: match ? match.title : category.slug,
        description: match ? match.description : null,
        isAudio: category.isAudio,
        displayOrder: category.displayOrder,
        parentId: category.parentId,
        parentSlug: pSlug || null,
        parentTitle: parentMatch ? parentMatch.title : pSlug || null,
        isSubcategory: Boolean(category.parentId),
        imageUrl: customImg || (pSlug ? `/images/subcategories/${pSlug}/${category.slug}.webp` : null),
        translations: category.translations.map((t: any) => ({
          code: t.language?.code || 'en',
          name: t.language?.name || 'English',
          title: t.title,
          description: t.description || null,
        })),
        contents: category.devotionalContents.map((d: any) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
          sacredText: d.sacredText || null,
          meaning: d.meaning || null,
          displayOrder: d.displayOrder,
        })),
        subcategories: category.subcategories.map((sub: any) => {
          const subSelectedMatch = sub.translations.find((t: any) => t.language?.code === targetLang);
          const subEnMatch = sub.translations.find((t: any) => t.language?.code === 'en');
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

    // Dynamic fallback so detail never returns 404 or empty
    const seedCategories = [
      { id: '1', slug: 'pooja-vidhanam', title: 'Pooja Vidhanam', description: 'Complete step-by-step pooja guides and vidhis', isAudio: false, isSubcategory: false },
      { id: '2', slug: 'astothrams', title: 'Astothrams', description: '108 Sacred Names & Namavalis for daily worship', isAudio: false, isSubcategory: false },
      { id: '3', slug: 'slokas', title: 'Slokas', description: 'Divine verses and mantras for peace and prosperity', isAudio: false, isSubcategory: false },
      { id: '4', slug: 'bhajans', title: 'Bhajans & Songs', description: 'Soul-stirring devotional songs and keerthanas', isAudio: true, isSubcategory: false },
    ];
    const catMatch = seedCategories.find(c => c.id === id || c.slug === id);
    if (catMatch) {
      return {
        id: catMatch.id,
        slug: catMatch.slug,
        title: catMatch.title,
        description: catMatch.description,
        isAudio: catMatch.isAudio,
        displayOrder: 1,
        parentId: null,
        parentSlug: null,
        parentTitle: null,
        isSubcategory: false,
        imageUrl: null,
        translations: [
          { code: 'en', name: 'English', title: catMatch.title, description: catMatch.description },
          { code: 'te', name: 'Telugu', title: catMatch.title, description: catMatch.description }
        ],
        contents: [],
        subcategories: []
      };
    }

    // Subcategory fallback
    const titleFormatted = id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return {
      id: String(id),
      slug: id,
      title: titleFormatted,
      description: `Complete sacred guide, procedure and mantras for ${titleFormatted}.`,
      isAudio: false,
      displayOrder: 1,
      parentId: 1,
      parentSlug: 'pooja',
      parentTitle: 'Pooja Vidhanam',
      isSubcategory: true,
      imageUrl: `/images/subcategories/pooja/${id}.webp`,
      translations: [
        { code: 'en', name: 'English', title: titleFormatted, description: `Complete sacred guide and mantras for ${titleFormatted}.` },
        { code: 'te', name: 'Telugu', title: titleFormatted, description: `సంపూర్ణ పూజా విధానం మరియు మంత్రములు.` },
        { code: 'kn', name: 'Kannada', title: titleFormatted, description: `ಸಂಪೂರ್ಣ ಪೂಜಾ ವಿಧಾನ ಮತ್ತು ಮಂತ್ರಗಳು.` },
        { code: 'ta', name: 'Tamil', title: titleFormatted, description: `முழுமையான பூஜை முறை மற்றும் மந்திரங்கள்.` },
        { code: 'hi', name: 'Hindi', title: titleFormatted, description: `सम्पूर्ण पूजा विधान एवं मन्त्र।` }
      ],
      contents: [
        {
          id: 1,
          title: `${titleFormatted} Sacred Chanting & Mantras`,
          slug: `${id}-chanting`,
          sacredText: 'ఓం శ్రీ స్వామియే శరణం అయ్యప్ప | ఓం నమో భగవతే వాసుదేవాయ ||',
          meaning: 'Step-by-step sacred procedure, invocation mantras, offering sequence, and prayer rules.'
        }
      ],
      subcategories: []
    };
  }
}
