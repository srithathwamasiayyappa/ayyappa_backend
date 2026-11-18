import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface TempleDto {
  id: string;
  dbId: number;
  name: string;
  originalName: string;
  localNames?: Record<string, string>;
  deityId: string;
  deityName?: string;
  city: string;
  district?: string;
  state: string;
  country: string;
  address?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  thumbnailUrl?: string;
  heroImageUrl?: string;
  about: string;
  history?: string;
  speciality?: string[];
  timings?: any;
  contact?: any;
  liveStreamId?: string;
  hasLiveDarshan: boolean;
  cropIndex: number;
  isActive: boolean;
}

const INITIAL_TEMPLES = [
  {
    slug: 'sabarimala',
    name: 'Sabarimala Temple',
    localNamesJson: JSON.stringify({
      te: 'శబరిమల శ్రీ ధర్మశాస్త దేవాలయం',
      kn: 'ಶಬರಿಮಲೆ ಶ್ರೀ ಧರ್ಮಶಾಸ್ತಾ ದೇವಾಲಯ',
      ta: 'சபரிமலை ஸ்ரீ தர்மசாஸ்தா திருக்கோயில்',
      hi: 'सबरीमाला श्री धर्मशास्ता मंदिर',
      ml: 'ശബരിമല ശ്രീ ധർമ്മശാസ്താ ക്ഷേത്രം',
      en: 'Sabarimala Temple',
    }),
    deityId: 'ayyappa',
    deityName: 'Lord Ayyappa',
    city: 'Pathanamthitta',
    district: 'Pathanamthitta',
    state: 'Kerala',
    country: 'India',
    address: 'Sannidhanam, Sabarimala, Periyar Tiger Reserve, Pathanamthitta District, Kerala',
    pincode: '689662',
    latitude: 9.4398,
    longitude: 77.0805,
    cropIndex: 0,
    about: 'One of the most revered and ancient hill shrines in India dedicated to Lord Ayyappa, located atop 18 sacred hills amidst the lush forests of the Western Ghats in Kerala.',
    history: 'According to temple tradition, Lord Ayyappa vanquished the demoness Mahishi and entered perpetual meditative penance at Sabarimala.',
    specialityJson: JSON.stringify([
      'Mandala - Makaravilakku season pilgrimage of 41 days of austerities (Vratam)',
      'Pathinettampadi — The 18 sacred gold-plated steps climbed only with Irumudi Kettu',
      'Neyyabhishekam — Sacred ghee abhishekam offered directly to Lord Ayyappa',
    ]),
    timingsJson: JSON.stringify({
      morning: '03:00 AM – 01:00 PM',
      evening: '03:00 PM – 11:00 PM',
    }),
    contactJson: JSON.stringify({
      phone: '+91 4735 202048',
      email: 'sabarimalatdb@gmail.com',
      website: 'https://sabarimala.kerala.gov.in',
    }),
    liveStreamId: 'sabarimala-live',
    hasLiveDarshan: true,
  },
  {
    slug: 'tirumala',
    name: 'Tirumala Tirupati',
    localNamesJson: JSON.stringify({
      te: 'తిరుమల శ్రీ వేంకటేశ్వర స్వామి దేవాలయం',
      kn: 'ತಿರುಮಲ ಶ್ರೀ ವೆಂಕಟೇಶ್ವರ ಸ್ವಾಮಿ ದೇವಾಲಯ',
      ta: 'திருமலை திருப்பதி ஸ்ரீ வெங்கடேஸ்வரா திருக்கோயில்',
      hi: 'तिरुपति बालाजी श्री वेंकटेश्वर मंदिर',
      ml: 'തിരുമല ശ്രീ വെങ്കിടേശ്വര സ്വാമി ക്ഷേത്രം',
      en: 'Tirumala Tirupati',
    }),
    deityId: 'venkateswara',
    deityName: 'Lord Venkateswara',
    city: 'Tirupati',
    district: 'Tirupati',
    state: 'Andhra Pradesh',
    country: 'India',
    address: 'S Mada St, Tirumala, Tirupati, Andhra Pradesh',
    pincode: '517504',
    latitude: 13.6833,
    longitude: 79.3472,
    cropIndex: 1,
    about: 'Situated in the sacred Seshachalam hill ranges, Tirumala Tirupati Devasthanams is among the most visited pilgrimage destinations on earth.',
    history: 'Known as the Kaliyuga Vaikuntham, Lord Sri Srinivasa manifested here to redeem mankind during the Kali Yuga.',
    specialityJson: JSON.stringify([
      'Kaliyuga Pratyaksha Daivam Lord Venkateswara',
      'World-famous Tirupati Laddu Prasadam',
    ]),
    timingsJson: JSON.stringify({
      morning: '02:30 AM – 11:30 PM',
    }),
    contactJson: JSON.stringify({
      phone: '+91 877 2277777',
      website: 'https://ttdevasthanams.ap.gov.in',
    }),
    liveStreamId: 'tirumala-live',
    hasLiveDarshan: true,
  },
  {
    slug: 'srisailam',
    name: 'Srisailam Mallikarjuna Swamy',
    localNamesJson: JSON.stringify({
      te: 'శ్రీశైలం భ్రమరాంబ మల్లికార్జున స్వామి దేవస్థానం',
      kn: 'ಶ್ರೀಶೈಲ ಮಲ್ಲಿಕಾರ್ಜುನ ಸ್ವಾಮಿ ದೇವಸ್ಥಾನ',
      ta: 'ஸ்ரீசைலம் மல்லிகார்ஜுன சுவாமி திருக்கோயில்',
      hi: 'श्रीशैलम मल्लिकार्जुन स्वामी ज्योतिर्लिंग',
      ml: 'ശ്രീശൈലം മല്ലികാർജ്ജുന സ്വാമി ക്ഷേത്രം',
      en: 'Srisailam Mallikarjuna Swamy',
    }),
    deityId: 'shiva',
    deityName: 'Lord Shiva',
    city: 'Srisailam',
    district: 'Nandyal',
    state: 'Andhra Pradesh',
    country: 'India',
    address: 'Srisailam Devasthanam, Srisailam, Andhra Pradesh',
    pincode: '518101',
    latitude: 16.0743,
    longitude: 78.8682,
    cropIndex: 2,
    about: 'One of the holiest shrines in Hinduism, revered uniquely as both one of the 12 Jyotirlingas and one of the 18 Maha Shakti Peethas.',
    history: 'Ancient historical texts and epics describe Srisailam atop the Nallamala hills as Sriparvata.',
    specialityJson: JSON.stringify([
      'Unique confluence of Jyotirlinga & Shakti Peetham',
      'Sparsha Darshanam allowing devotees to touch the sacred Shiva Lingam',
    ]),
    timingsJson: JSON.stringify({
      morning: '04:30 AM – 03:30 PM',
      evening: '06:00 PM – 10:00 PM',
    }),
    contactJson: JSON.stringify({
      phone: '+91 8524 288888',
      website: 'https://srisailamonline.com',
    }),
    liveStreamId: 'srisailam-live',
    hasLiveDarshan: true,
  },
  {
    slug: 'kashi-vishwanath',
    name: 'Kashi Vishwanath Temple',
    localNamesJson: JSON.stringify({
      te: 'కాశీ విశ్వనాథ మందిరం',
      kn: 'ಕಾಶಿ ವಿಶ್ವನಾಥ ದೇವಸ್ಥಾನ',
      ta: 'காசி விஸ்வநாதர் திருக்கோயில்',
      hi: 'काशी विश्वनाथ मंदिर, वाराणसी',
      ml: 'കാശി വിശ്വനാഥ ക്ഷേത്രം',
      en: 'Kashi Vishwanath Temple',
    }),
    deityId: 'shiva',
    deityName: 'Lord Shiva',
    city: 'Varanasi',
    district: 'Varanasi',
    state: 'Uttar Pradesh',
    country: 'India',
    address: 'Lahori Tola, Varanasi, Uttar Pradesh',
    pincode: '221001',
    latitude: 25.3109,
    longitude: 83.0107,
    cropIndex: 3,
    about: 'Situated on the western bank of the holy river Ganga in Varanasi, one of the oldest living cities in the world.',
    history: 'Referred to in the Skanda Purana, the sacred Lingam of Vishweshwara stands as the spiritual center of the universe.',
    specialityJson: JSON.stringify([
      'Pivotal Jyotirlinga along the sacred river Ganges',
      'Mangala Aarti before sunrise',
    ]),
    timingsJson: JSON.stringify({
      morning: '03:00 AM – 11:00 PM',
    }),
    contactJson: JSON.stringify({
      phone: '+91 542 2392629',
      website: 'https://shrikashivishwanath.org',
    }),
    liveStreamId: 'kashi-live',
    hasLiveDarshan: true,
  },
  {
    slug: 'rameswaram',
    name: 'Ramanathaswamy Temple',
    localNamesJson: JSON.stringify({
      te: 'రామేశ్వరం శ్రీ రామనాథస్వామి దేవాలయం',
      kn: 'ರಾಮೇಶ್ವರಂ ರಾಮನಾಥಸ್ವಾಮಿ ದೇವಾಲಯ',
      ta: 'ராமேஸ்வரம் ஸ்ரீ ராமநாதசுவாமி திருக்கோயில்',
      hi: 'रामेश्वरम श्री रामनाथस्वामी ज्योतिर्लिंग',
      ml: 'രാമേശ്വരം രാമനാഥസ്വാമി ക്ഷേത്രം',
      en: 'Ramanathaswamy Temple',
    }),
    deityId: 'shiva',
    deityName: 'Lord Shiva',
    city: 'Rameswaram',
    district: 'Ramanathapuram',
    state: 'Tamil Nadu',
    country: 'India',
    address: 'Rameswaram, Tamil Nadu',
    pincode: '623526',
    latitude: 9.2881,
    longitude: 79.3174,
    cropIndex: 4,
    about: 'Located on Rameswaram island, Tamil Nadu, renowned for its magnificent sculptured pillars and sacred 22 theerthams.',
    history: 'According to the Ramayana, Lord Rama worshipped Lord Shiva here to absolve sins after defeating Ravana.',
    specialityJson: JSON.stringify([
      'The Southernmost Jyotirlinga of Bharat',
      'World-famous outer corridor with 1212 intricately carved granite pillars',
    ]),
    timingsJson: JSON.stringify({
      morning: '05:00 AM – 01:00 PM',
      evening: '03:00 PM – 09:00 PM',
    }),
    contactJson: JSON.stringify({
      phone: '+91 4573 221223',
      website: 'https://rameswaramtemple.tnhrce.in',
    }),
    hasLiveDarshan: false,
  },
];

@Injectable()
export class TemplesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureTablesExist();
  }

  private async ensureTablesExist() {
    try {
      await this.prisma.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS \`temples\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`slug\` VARCHAR(100) NOT NULL UNIQUE,
          \`name\` VARCHAR(255) NOT NULL,
          \`local_names_json\` TEXT NULL,
          \`deity_id\` VARCHAR(50) NOT NULL,
          \`deity_name\` VARCHAR(100) NULL,
          \`city\` VARCHAR(100) NOT NULL,
          \`district\` VARCHAR(100) NULL,
          \`state\` VARCHAR(100) NOT NULL,
          \`country\` VARCHAR(100) NOT NULL DEFAULT 'India',
          \`address\` VARCHAR(500) NULL,
          \`pincode\` VARCHAR(20) NULL,
          \`latitude\` DOUBLE NULL,
          \`longitude\` DOUBLE NULL,
          \`thumbnail_url\` VARCHAR(500) NULL,
          \`hero_image_url\` VARCHAR(500) NULL,
          \`about\` TEXT NOT NULL,
          \`history\` TEXT NULL,
          \`speciality_json\` TEXT NULL,
          \`timings_json\` TEXT NULL,
          \`contact_json\` TEXT NULL,
          \`live_stream_id\` VARCHAR(100) NULL,
          \`has_live_darshan\` TINYINT(1) NOT NULL DEFAULT 0,
          \`crop_index\` INT NOT NULL DEFAULT 0,
          \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
          \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          INDEX (\`deity_id\`),
          INDEX (\`state\`),
          INDEX (\`is_active\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Seed if empty
      const rows: any = await this.prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM \`temples\``);
      const count = Number(rows?.[0]?.count ?? 0);
      if (count === 0) {
        for (const t of INITIAL_TEMPLES) {
          await this.prisma.$queryRawUnsafe(`
            INSERT IGNORE INTO \`temples\` 
            (\`slug\`, \`name\`, \`local_names_json\`, \`deity_id\`, \`deity_name\`, \`city\`, \`district\`, \`state\`, \`country\`, \`address\`, \`pincode\`, \`latitude\`, \`longitude\`, \`about\`, \`history\`, \`speciality_json\`, \`timings_json\`, \`contact_json\`, \`live_stream_id\`, \`has_live_darshan\`, \`crop_index\`, \`is_active\`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
            t.slug,
            t.name,
            t.localNamesJson,
            t.deityId,
            t.deityName,
            t.city,
            t.district,
            t.state,
            t.country,
            t.address,
            t.pincode,
            t.latitude,
            t.longitude,
            t.about,
            t.history,
            t.specialityJson,
            t.timingsJson,
            t.contactJson,
            t.liveStreamId || null,
            t.hasLiveDarshan ? 1 : 0,
            t.cropIndex
          );
        }
      }
    } catch (e) {
      console.warn('[TemplesService] ensureTablesExist note:', e);
    }
  }

  private transformTemple(t: any, lang = 'en'): TempleDto {
    let localNames: Record<string, string> = {};
    try {
      if (t.local_names_json) localNames = JSON.parse(t.local_names_json);
      else if (t.localNamesJson) localNames = JSON.parse(t.localNamesJson);
    } catch {}

    let speciality: string[] = [];
    try {
      if (t.speciality_json) speciality = JSON.parse(t.speciality_json);
      else if (t.specialityJson) speciality = JSON.parse(t.specialityJson);
    } catch {}

    let timings: any = undefined;
    try {
      if (t.timings_json) timings = JSON.parse(t.timings_json);
      else if (t.timingsJson) timings = JSON.parse(t.timingsJson);
    } catch {}

    let contact: any = undefined;
    try {
      if (t.contact_json) contact = JSON.parse(t.contact_json);
      else if (t.contactJson) contact = JSON.parse(t.contactJson);
    } catch {}

    const localizedName = (localNames && localNames[lang]) || t.name;

    return {
      id: t.slug,
      dbId: t.id,
      name: localizedName,
      originalName: t.name,
      localNames,
      deityId: t.deity_id || t.deityId,
      deityName: t.deity_name || t.deityName || undefined,
      city: t.city,
      district: t.district || undefined,
      state: t.state,
      country: t.country || 'India',
      address: t.address || undefined,
      pincode: t.pincode || undefined,
      latitude: t.latitude ?? undefined,
      longitude: t.longitude ?? undefined,
      thumbnailUrl: t.thumbnail_url || t.thumbnailUrl || undefined,
      heroImageUrl: t.hero_image_url || t.heroImageUrl || undefined,
      about: t.about,
      history: t.history || undefined,
      speciality: speciality.length > 0 ? speciality : undefined,
      timings,
      contact,
      liveStreamId: t.live_stream_id || t.liveStreamId || undefined,
      hasLiveDarshan: Boolean(t.has_live_darshan || t.hasLiveDarshan),
      cropIndex: t.crop_index ?? t.cropIndex ?? 0,
      isActive: Boolean(t.is_active ?? t.isActive ?? true),
    };
  }

  async getTemples(query: { lang?: string; q?: string; deity?: string }): Promise<TempleDto[]> {
    await this.ensureTablesExist();

    let sql = 'SELECT * FROM `temples` WHERE `is_active` = 1';
    const params: any[] = [];

    if (query.deity && query.deity !== 'all') {
      sql += ' AND LOWER(`deity_id`) = ?';
      params.push(query.deity.toLowerCase());
    }

    if (query.q && query.q.trim()) {
      const q = `%${query.q.trim()}%`;
      sql += ' AND (`name` LIKE ? OR `city` LIKE ? OR `state` LIKE ? OR `deity_name` LIKE ? OR `district` LIKE ? OR `local_names_json` LIKE ?)';
      params.push(q, q, q, q, q, q);
    }

    sql += ' ORDER BY `crop_index` ASC, `id` ASC';

    try {
      const rows: any = await this.prisma.$queryRawUnsafe(sql, ...params);
      if (Array.isArray(rows)) {
        return rows.map((r) => this.transformTemple(r, query.lang || 'en'));
      }
    } catch (e) {
      console.warn('[TemplesService] getTemples error:', e);
    }

    return [];
  }

  async getTempleById(idOrSlug: string, lang = 'en'): Promise<TempleDto> {
    await this.ensureTablesExist();

    const numericId = parseInt(idOrSlug, 10);
    let sql = 'SELECT * FROM `temples` WHERE (`slug` = ?';
    const params: any[] = [idOrSlug];

    if (!isNaN(numericId)) {
      sql += ' OR `id` = ?';
      params.push(numericId);
    }
    sql += ') AND `is_active` = 1 LIMIT 1';

    try {
      const rows: any = await this.prisma.$queryRawUnsafe(sql, ...params);
      if (Array.isArray(rows) && rows.length > 0) {
        return this.transformTemple(rows[0], lang);
      }
    } catch (e) {
      console.warn('[TemplesService] getTempleById error:', e);
    }

    throw new NotFoundException(`Temple not found for identifier: ${idOrSlug}`);
  }
}
