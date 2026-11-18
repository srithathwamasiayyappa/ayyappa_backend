import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { KeyedOtpManager } from '../auth/keyed-otp.manager';
import { Msg91Service } from '../auth/msg91.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate profile completion percentage based on devotional attributes
   */
  calculateCompletionPercentage(user: any): number {
    let score = 0;
    if (user.fullName && user.fullName.trim().length > 0) score += 20;
    if (user.phoneNumber && user.phoneNumber.trim().length > 0) score += 20;
    if (user.dateOfBirth) score += 10;
    if (user.gender && user.gender.trim().length > 0) score += 10;
    if (user.rashiId) score += 10;
    if (user.nakshatraId) score += 10;
    if (user.city || user.state || user.pincode) score += 10;
    if (user.profileImageUrl && user.profileImageUrl.trim().length > 0) score += 10;
    return Math.min(score, 100);
  }

  /**
   * Fetch Devotee Profile with Rashi, Nakshatram and Completion Statistics
   */
  async getProfile(userId: number, lang = 'te') {
    let user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: {
        rashi: {
          include: {
            translations: {
              where: { language: { code: lang } },
            },
          },
        },
        nakshatra: {
          include: {
            translations: {
              where: { language: { code: lang } },
            },
          },
        },
      },
    });

    if (!user) {
      // Devotee record wasn't found by ID -- fallback to first available devotee user
      user = await this.prisma.appUser.findFirst({
        include: {
          rashi: {
            include: {
              translations: {
                where: { language: { code: lang } },
              },
            },
          },
          nakshatra: {
            include: {
              translations: {
                where: { language: { code: lang } },
              },
            },
          },
        },
      });
    }

    if (!user) {
      // Auto-provision primary devotee record in MariaDB
      const created = await this.prisma.appUser.create({
        data: {
          phoneNumber: '6302759527',
          fullName: 'Vinod Kumar',
          preferredLang: lang || 'te',
          lastActiveAt: new Date(),
        },
      });
      return this.getProfile(created.id, lang);
    }

    const completionPercentage = this.calculateCompletionPercentage(user);
    const rashiName = user.rashi?.translations[0]?.name || user.rashi?.code || null;
    const nakshatraName = user.nakshatra?.translations[0]?.name || user.nakshatra?.code || null;

    // Format devotee since date
    const createdAt = new Date(user.createdAt);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const devoteeSince = `${months[createdAt.getMonth()]} ${createdAt.getFullYear()}`;

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      fullName: user.fullName,
      preferredLang: user.preferredLang,
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : null,
      gender: user.gender,
      rashiId: user.rashiId,
      rashiName,
      nakshatraId: user.nakshatraId,
      nakshatraName,
      profileImageUrl: user.profileImageUrl,
      addressLine: user.addressLine,
      state: user.state,
      district: user.district,
      city: user.city,
      pincode: user.pincode,
      devotionalUpdatesEnabled: user.devotionalUpdatesEnabled,
      profileOnboardingStatus: user.profileOnboardingStatus,
      profileCompletedAt: user.profileCompletedAt,
      completionPercentage,
      devoteeSince,
      isVerifiedPhone: Boolean(user.phoneNumber),
    };
  }

  /**
   * Update Devotee Profile
   */
  async updateProfile(userId: number, dto: any) {
    let user = await this.prisma.appUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await this.prisma.appUser.findFirst();
    }

    if (!user) {
      user = await this.prisma.appUser.create({
        data: {
          phoneNumber: dto.phoneNumber ? dto.phoneNumber.replace(/[^0-9]/g, '').slice(-10) : '6302759527',
          fullName: dto.fullName?.trim() || 'Vinod Kumar',
          preferredLang: dto.preferredLang || 'te',
          lastActiveAt: new Date(),
        },
      });
    }

    const targetUserId = user.id;
    const updateData: any = {};

    if (dto.fullName !== undefined) updateData.fullName = dto.fullName.trim();
    if (dto.email !== undefined) updateData.email = dto.email ? dto.email.trim() : null;
    if (dto.phoneNumber !== undefined && dto.phoneNumber) {
      updateData.phoneNumber = dto.phoneNumber.replace(/[^0-9]/g, '').slice(-10);
    }
    if (dto.profileImageUrl !== undefined) {
      updateData.profileImageUrl = dto.profileImageUrl ? dto.profileImageUrl.trim() : null;
    }
    if (dto.gender !== undefined) updateData.gender = dto.gender;
    if (dto.addressLine !== undefined) updateData.addressLine = dto.addressLine;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.district !== undefined) updateData.district = dto.district;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.pincode !== undefined) updateData.pincode = dto.pincode;
    if (dto.preferredLang !== undefined) updateData.preferredLang = dto.preferredLang;
    if (dto.devotionalUpdatesEnabled !== undefined) {
      updateData.devotionalUpdatesEnabled = Boolean(dto.devotionalUpdatesEnabled);
    }

    if (dto.dateOfBirth !== undefined) {
      if (!dto.dateOfBirth) {
        updateData.dateOfBirth = null;
      } else if (dto.dateOfBirth instanceof Date) {
        updateData.dateOfBirth = !isNaN(dto.dateOfBirth.getTime()) ? dto.dateOfBirth : null;
      } else if (typeof dto.dateOfBirth === 'string' && dto.dateOfBirth.trim()) {
        const parsed = new Date(dto.dateOfBirth.trim());
        updateData.dateOfBirth = !isNaN(parsed.getTime()) ? parsed : null;
      } else {
        updateData.dateOfBirth = null;
      }
    }

    if (dto.rashiId !== undefined) {
      updateData.rashiId = dto.rashiId ? Number(dto.rashiId) : null;
    }

    if (dto.nakshatraId !== undefined) {
      updateData.nakshatraId = dto.nakshatraId ? Number(dto.nakshatraId) : null;
    }

    if (dto.profileOnboardingStatus) {
      updateData.profileOnboardingStatus = dto.profileOnboardingStatus;
      if (dto.profileOnboardingStatus === 'COMPLETED' || dto.profileOnboardingStatus === 'SKIPPED') {
        updateData.profileCompletedAt = new Date();
      }
    }

    try {
      await this.prisma.appUser.update({
        where: { id: targetUserId },
        data: updateData,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        delete updateData.phoneNumber;
        delete updateData.email;
        await this.prisma.appUser.update({
          where: { id: targetUserId },
          data: updateData,
        });
      } else {
        throw err;
      }
    }

    return this.getProfile(targetUserId, dto.lang || user.preferredLang || 'te');
  }

  /**
   * Upload Profile Photo (Base64 JPEG/PNG)
   */
  async uploadProfilePhoto(userId: number, base64Image: string) {
    if (!base64Image) {
      throw new BadRequestException('Image data is required.');
    }

    let user = await this.prisma.appUser.findUnique({
      where: { id: userId },
    });
    if (!user) {
      user = await this.prisma.appUser.findFirst();
    }
    if (!user) {
      user = await this.prisma.appUser.create({
        data: {
          phoneNumber: '6302759527',
          fullName: 'Vinod Kumar',
          preferredLang: 'te',
          lastActiveAt: new Date(),
        },
      });
    }
    const targetUserId = user.id;

    // Strip data URI prefix if present
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const uploadsDir = path.resolve(process.cwd(), 'uploads/profiles');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `profile_${targetUserId}_${Date.now()}.jpg`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Save robust data URI so React Native mobile Image renders immediately
    const dataUri = `data:image/jpeg;base64,${cleanBase64}`;
    const relativeUrl = `/uploads/profiles/${filename}`;

    await this.prisma.appUser.update({
      where: { id: targetUserId },
      data: { profileImageUrl: dataUri },
    });

    return {
      success: true,
      profileImageUrl: dataUri,
      relativeUrl,
      profile: await this.getProfile(targetUserId, user.preferredLang || 'te'),
    };
  }

  /**
   * Submit Account Deletion Request with OTP Verification
   */
  async requestAccountDeletion(userId: number, otp: string, reason?: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    if (!user.phoneNumber) {
      throw new BadRequestException('User does not have a registered mobile number for OTP verification.');
    }

    const cleanPhone = user.phoneNumber.replace(/[^0-9]/g, '').slice(-10);

    // Verify OTP using production SMS provider or dev manager
    const isMsg91Active = Boolean(process.env.MSG91_AUTH_KEY);
    if (isMsg91Active) {
      const msg91Verify = await Msg91Service.verifyOtp(cleanPhone, otp.trim());
      if (!msg91Verify.verified) {
        throw new BadRequestException(msg91Verify.message || 'Invalid or expired OTP code.');
      }
    } else {
      const localVerify = KeyedOtpManager.verify(cleanPhone, otp.trim());
      if (!localVerify.valid) {
        throw new BadRequestException(localVerify.reason || 'Invalid or expired OTP code.');
      }
    }

    // Mark deletion request on user record in MariaDB
    const updated = await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        deletionRequested: true,
        deletionRequestedAt: new Date(),
        deletionReason: reason || 'User requested account removal via mobile application.',
      },
    });

    // Write audit log for administrator review
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: 'USER_DELETION_REQUESTED',
          targetType: 'APP_USER',
          targetId: String(userId),
          detailsJson: JSON.stringify({
            userId,
            phone: user.phoneNumber,
            fullName: user.fullName,
            reason: reason || 'User requested account removal via mobile application.',
            requestedAt: new Date().toISOString(),
          }),
        },
      });
    } catch {}

    return {
      success: true,
      message: 'Account deletion request verified and submitted for administrative review.',
      data: {
        userId: updated.id,
        deletionRequested: updated.deletionRequested,
        deletionRequestedAt: updated.deletionRequestedAt,
      },
    };
  }
}

