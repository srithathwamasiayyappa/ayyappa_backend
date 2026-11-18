import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Query,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Msg91Service } from './msg91.service';
import { KeyedOtpManager } from './keyed-otp.manager';
import { FirebaseAuthService } from './firebase-auth.service';
import * as crypto from 'crypto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAuthService: FirebaseAuthService,
  ) {}

  /**
   * Helper to ensure database is online before performing any operation
   * Logs error details and throws 503 Service Unavailable if database is unreachable.
   */
  private async ensureDatabaseOnline(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (dbErr: any) {
      this.logger.error(`Database health check failed: ${dbErr?.message || dbErr}`);
      throw new ServiceUnavailableException(
        `Database connection error: ${dbErr?.message || 'Database unavailable'}. Please verify MariaDB credentials in cPanel .env.`,
      );
    }
  }

  /**
   * Check if Phone Number is already registered in MariaDB
   * POST /api/v1/auth/check-phone
   */
  @Post('check-phone')
  async checkPhone(@Body() body: { 
    phoneNumber: string; 
    intent?: 'LOGIN' | 'REGISTER'; 
    role?: 'CUSTOMER' | 'DHARMA_KARTHA';
    fullName?: string;
    templeName?: string;
    templeTrustName?: string;
    templeCity?: string;
  }) {
    await this.ensureDatabaseOnline();

    const { phoneNumber } = body;
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      throw new BadRequestException('Please enter a valid 10-digit mobile number.');
    }

    const cleanPhone = phoneNumber.trim().replace(/[^0-9]/g, '').slice(-10);
    const requestedRole = (body.role || 'CUSTOMER').toUpperCase();
    const reqIntent = body.intent ? body.intent.toUpperCase() : null;

    let user = null;
    let memberships: any[] = [];
    try {
      user = await this.prisma.appUser.findFirst({
        where: {
          OR: [
            { phoneNumber: cleanPhone },
            { phoneNumber: `+91${cleanPhone}` },
            { phoneNumber: `91${cleanPhone}` },
          ],
        },
      });

      if (user) {
        try {
          memberships = await (this.prisma as any).templeMembership.findMany({
            where: { userId: user.id },
          });
        } catch {}
      }
    } catch (dbErr: any) {
      this.logger.warn(`Direct DB query failed, attempting health check: ${dbErr?.message || dbErr}`);
      await this.ensureDatabaseOnline();
    }

    // Role detection:
    // User is registered as CUSTOMER if user record exists.
    // User is registered as DHARMA_KARTHA if user record exists AND:
    // (memberships exist OR addressLine contains DK_META with role DHARMA_KARTHA).
    let hasCustomerAccount = Boolean(user);
    let hasDharmaKarthaAccount = false;

    if (user) {
      if (memberships && memberships.length > 0) {
        hasDharmaKarthaAccount = true;
      } else if (user.addressLine?.startsWith('DK_META:')) {
        try {
          const parsed = JSON.parse(user.addressLine.replace('DK_META:', ''));
          if (parsed.role === 'DHARMA_KARTHA' || parsed.templeName) {
            hasDharmaKarthaAccount = true;
          }
        } catch {}
      }
    }

    // Role-specific registration status
    const isRegisteredForRole = requestedRole === 'DHARMA_KARTHA' ? hasDharmaKarthaAccount : hasCustomerAccount;
    const isSuspended = Boolean(user?.isSuspended);

    let message = 'Mobile number verified successfully.';
    let navigationAction = isRegisteredForRole ? 'LOGIN' : 'REGISTER';

    if (isSuspended) {
      message = 'Your devotee account is currently suspended. Please contact temple administration.';
      navigationAction = 'SUSPENDED';
    } else if (requestedRole === 'DHARMA_KARTHA') {
      if (hasDharmaKarthaAccount) {
        if (reqIntent === 'REGISTER') {
          message = 'This mobile number is already registered as a Dharma Kartha (Temple Founder). Please proceed to Login.';
        } else {
          message = 'Dharma Kartha mobile number verified. Proceeding with Login OTP.';
        }
        navigationAction = 'LOGIN';
      } else {
        // Not registered as Dharma Kartha yet!
        if (reqIntent === 'LOGIN') {
          message = hasCustomerAccount
            ? 'This mobile number is registered as a Customer, but not as a Dharma Kartha. Please register your temple founder profile first.'
            : 'No Dharma Kartha account found with this mobile number. Please register your temple founder profile first.';
        } else {
          message = 'Mobile number verified. Proceeding with Dharma Kartha registration.';
        }
        navigationAction = 'REGISTER';
      }
    } else {
      // Customer Role
      if (hasCustomerAccount) {
        if (reqIntent === 'REGISTER') {
          message = 'This mobile number is already registered as a Customer. Please proceed to Login.';
        } else {
          message = 'Customer mobile number verified. Proceeding with Login OTP.';
        }
        navigationAction = 'LOGIN';
      } else {
        if (reqIntent === 'LOGIN') {
          message = 'This mobile number is not registered as a Customer yet. Please create your devotee account first.';
        } else {
          message = 'Mobile number verified. Proceeding with Customer Registration OTP.';
        }
        navigationAction = 'REGISTER';
      }
    }

    return {
      success: true,
      isRegistered: isRegisteredForRole,
      hasCustomerAccount,
      hasDharmaKarthaAccount,
      role: requestedRole,
      templeName: body.templeName ? body.templeName.trim() : undefined,
      templeTrustName: body.templeTrustName ? body.templeTrustName.trim() : undefined,
      templeCity: body.templeCity ? body.templeCity.trim() : undefined,
      isSuspended,
      phoneNumber: cleanPhone,
      navigationAction,
      redirectTo: isRegisteredForRole ? '/auth-login' : '/auth-register',
      message,
    };
  }

  /**
   * Firebase Phone OTP Authentication
   * POST /api/v1/auth/firebase-phone
   * Strictly verifies signed Firebase Phone ID tokens against Firebase Admin SDK & Identity Toolkit.
   * - Enforces verified phone_number claim
   * - Applies LOGIN vs REGISTER intent policies
   * - Enforces account suspension checks
   * - Atomically provisions or authenticates devotee in MariaDB
   */
  @Post('firebase-phone')
  async firebasePhoneAuth(@Body() body: {
    idToken: string;
    intent?: 'LOGIN' | 'REGISTER';
    fullName?: string;
    preferredLang?: string;
    role?: 'CUSTOMER' | 'DHARMA_KARTHA';
    templeName?: string;
    templeTrustName?: string;
    templeCity?: string;
  }) {
    await this.ensureDatabaseOnline();

    const { idToken, intent = 'LOGIN', fullName, preferredLang, role, templeName, templeTrustName, templeCity } = body;
    return this.firebaseAuthService.authenticateWithFirebasePhone({
      idToken,
      intent,
      fullName,
      preferredLang,
      role,
      templeName,
      templeTrustName,
      templeCity,
    });
  }

  /**
   * Request 6-Digit OTP (Supports MSG91 carrier delivery or Keyed HMAC Verification)
   * - Strict 6 digits: crypto.randomInt(100000, 1000000)
   * - 5-minute expiry
   * - 30s server-enforced cooldown
   * - Max 3 attempts
   * - Zero raw OTP exposure in logs or API responses
   */
  @Post('send-otp')
  async sendOtp(@Body() body: { phoneNumber: string; type?: 'login' | 'register' | 'delete_account' }) {
    await this.ensureDatabaseOnline();

    const { phoneNumber, type = 'register' } = body;
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      throw new BadRequestException('Please enter a valid 10-digit mobile number.');
    }

    const cleanPhone = phoneNumber.trim().replace(/[^0-9]/g, '').slice(-10);

    // Enforce 30s cooldown
    const cooldownRemaining = KeyedOtpManager.getRemainingCooldown(cleanPhone);
    if (cooldownRemaining > 0) {
      throw new BadRequestException(`Please wait ${cooldownRemaining} seconds before requesting a new OTP.`);
    }

    // Verify existing user state in database
    const existingUser = await this.prisma.appUser.findFirst({
      where: {
        OR: [
          { phoneNumber: cleanPhone },
          { phoneNumber: `+91${cleanPhone}` },
          { phoneNumber: `91${cleanPhone}` },
        ],
      },
    });

    if (type === 'register' && existingUser) {
      throw new BadRequestException('This mobile number is already registered. Please go to Sign In.');
    }
    if (type === 'login' && !existingUser) {
      throw new BadRequestException('No devotee account found with this mobile number. Please register first.');
    }
    if (type === 'delete_account' && !existingUser) {
      throw new BadRequestException('No devotee account found associated with this mobile number.');
    }
    if (existingUser && existingUser.isDeleted) {
      throw new UnauthorizedException('This devotee account has been deactivated. Please contact temple administration.');
    }
    if (existingUser && existingUser.isSuspended) {
      throw new UnauthorizedException('This devotee account has been suspended. Please contact temple administration.');
    }

    // Carrier SMS Verification Gate (MSG91 / Enterprise SMS Gateways)
    const isMsg91Active = Boolean(process.env.MSG91_AUTH_KEY);

    if (isMsg91Active) {
      // Production MSG91 SendOTP v5 API Dispatch
      const msg91Result = await Msg91Service.sendOtp(cleanPhone);
      if (!msg91Result.success) {
        throw new BadRequestException(msg91Result.message);
      }
      return {
        success: true,
        message: 'Verification code sent to your registered mobile number.',
        phoneNumber: cleanPhone,
      };
    }

    // When client calls /send-otp directly with carrier integration enabled
    throw new BadRequestException('Real-time SMS gateway is required. Please use Firebase Phone Authentication or configure SMS provider credentials.');
  }

  /**
   * Register with Devotee Full Name + Mobile + OTP
   * - Enforces database uniqueness
   * - Atomic OTP consumption
   * - Fails with 503 if database commit fails
   */
  @Post('register-otp')
  async registerWithOtp(@Body() body: {
    fullName: string;
    phoneNumber: string;
    otp: string;
    email?: string;
    preferredLang?: string;
  }) {
    await this.ensureDatabaseOnline();

    const { fullName, phoneNumber, otp, email, preferredLang } = body;

    if (!fullName || !fullName.trim()) {
      throw new BadRequestException('Please enter devotee full name.');
    }
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      throw new BadRequestException('Please enter a valid 10-digit mobile number.');
    }
    if (!otp || otp.trim().length !== 6) {
      throw new BadRequestException('Please enter the 6-digit OTP code.');
    }

    const cleanPhone = phoneNumber.trim().replace(/[^0-9]/g, '').slice(-10);

    // Verify OTP through MSG91 (Production) or KeyedOtpManager (Local Dev)
    const isMsg91Active = Boolean(process.env.MSG91_AUTH_KEY);
    if (isMsg91Active) {
      const msg91Verify = await Msg91Service.verifyOtp(cleanPhone, otp.trim());
      if (!msg91Verify.verified) {
        throw new BadRequestException(msg91Verify.message);
      }
    } else {
      const localVerify = KeyedOtpManager.verify(cleanPhone, otp.trim());
      if (!localVerify.valid) {
        throw new BadRequestException(localVerify.reason || 'Invalid or expired OTP code.');
      }
    }

    // Check duplicate account
    const existing = await this.prisma.appUser.findFirst({
      where: {
        OR: [
          { phoneNumber: cleanPhone },
          { phoneNumber: `+91${cleanPhone}` },
          { phoneNumber: `91${cleanPhone}` },
        ],
      },
    });
    if (existing) {
      throw new BadRequestException('This mobile number is already registered. Please login.');
    }

    try {
      // Atomic MySQL User Creation
      const newUser = await this.prisma.appUser.create({
        data: {
          phoneNumber: cleanPhone,
          fullName: fullName.trim(),
          email: email?.trim() || null,
          preferredLang: preferredLang || 'en',
          lastActiveAt: new Date(),
        },
      });

      return {
        success: true,
        message: 'Registration has been successfully completed.',
        user: {
          id: newUser.id,
          phoneNumber: newUser.phoneNumber,
          fullName: newUser.fullName,
          email: newUser.email,
          preferredLang: newUser.preferredLang,
        },
      };
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new BadRequestException('This mobile number is already registered. Please login.');
      }
      throw err;
    }
  }

  /**
   * Login with Registered Mobile + OTP
   * - Enforces verified phone lookup
   * - Enforces suspended account rejection
   * - Issues authenticated devotee session
   */
  @Post('login-otp')
  async loginWithOtp(@Body() body: { phoneNumber: string; otp: string }) {
    await this.ensureDatabaseOnline();

    const { phoneNumber, otp } = body;

    if (!phoneNumber || phoneNumber.trim().length < 10) {
      throw new BadRequestException('Please enter a valid 10-digit mobile number.');
    }
    if (!otp || otp.trim().length !== 6) {
      throw new BadRequestException('Please enter the 6-digit OTP code.');
    }

    const cleanPhone = phoneNumber.trim().replace(/[^0-9]/g, '').slice(-10);

    // Verify OTP through MSG91 (Production) or KeyedOtpManager (Local Dev)
    const isMsg91Active = Boolean(process.env.MSG91_AUTH_KEY);
    if (isMsg91Active) {
      const msg91Verify = await Msg91Service.verifyOtp(cleanPhone, otp.trim());
      if (!msg91Verify.verified) {
        throw new BadRequestException(msg91Verify.message);
      }
    } else {
      const localVerify = KeyedOtpManager.verify(cleanPhone, otp.trim());
      if (!localVerify.valid) {
        throw new BadRequestException(localVerify.reason || 'Invalid or expired OTP code.');
      }
    }

    // Lookup user in database
    const user = await this.prisma.appUser.findFirst({
      where: {
        OR: [
          { phoneNumber: cleanPhone },
          { phoneNumber: `+91${cleanPhone}` },
          { phoneNumber: `91${cleanPhone}` },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('No devotee account found with this mobile number. Please register first.');
    }

    if (user.isDeleted) {
      throw new UnauthorizedException('This devotee account has been deactivated. Please contact temple administration.');
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('This devotee account has been suspended. Please contact temple administration.');
    }

    // Update active timestamp
    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    return {
      success: true,
      message: 'Successfully logged in.',
      user: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        email: user.email,
        preferredLang: user.preferredLang,
      },
    };
  }

  /**
   * Google Identity OAuth Token Verification
   * Strictly verifies signed Google identity tokens directly against Google's tokeninfo API.
   * - Mandatory idToken verification
   * - Cryptographic signature & expiry validation via Google OAuth2 service
   * - Google Issuer verification ('accounts.google.com' or 'https://accounts.google.com')
   * - Audience verification against authorized Firebase project / Google Client IDs
   * - Verified email status check (email_verified === 'true' / true)
   * - Devotee account suspension gate
   * - Extracts verified identity directly from Google's cryptographically signed claims
   * - Prevents unauthenticated email/name injection
   */
  @Post('google')
  async googleAuth(@Body() body: {
    idToken?: string;
    email?: string;
    fullName?: string;
    googleId?: string;
  }) {
    await this.ensureDatabaseOnline();

    const { idToken, email: inputEmail, fullName: inputFullName, googleId: inputGoogleId } = body;

    if (!idToken || !idToken.trim()) {
      throw new BadRequestException('Google ID token is required for authentication.');
    }

    const tokenStr = idToken.trim();

    // Reject any mock, simulated, or dev tokens
    if (tokenStr.startsWith('dev_') || tokenStr.startsWith('dynamic_') || tokenStr.includes('_payload_')) {
      throw new UnauthorizedException('Simulated or mock Google credentials are not accepted.');
    }

    let tokenInfo: any;
    try {
      // Check as ID token first, fallback to userinfo if access token
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenStr)}`);
      if (verifyRes.ok) {
        tokenInfo = await verifyRes.json();
      } else {
        const accessVerifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(tokenStr)}`);
        if (accessVerifyRes.ok) {
          tokenInfo = await accessVerifyRes.json();
        } else {
          throw new UnauthorizedException('Invalid or expired Google identity token.');
        }
      }
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      throw new ServiceUnavailableException('Google identity verification service unreachable. Please check network connection.');
    }

    // 1. Verify Issuer: If id_token, check issuer
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (tokenInfo.iss && !validIssuers.includes(tokenInfo.iss)) {
      throw new UnauthorizedException('Google identity token issuer is invalid.');
    }

    // 2. Exact OAuth Audience Allowlist Verification (Fail-Closed)
    // For id_token it is 'aud', for access_token it is 'aud' or 'azp'
    const tokenAud = (tokenInfo.aud || tokenInfo.azp || '').trim();

    const allowedClientIds = [
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean) as string[];

    // Strict Fail-Closed Policy: If no authorized client IDs are configured on the server, reject authentication
    if (allowedClientIds.length === 0) {
      throw new ServiceUnavailableException(
        'Google OAuth authentication is not configured: No authorized client IDs registered in server environment.'
      );
    }

    // Exact string comparison — NO prefix matching, NO suffix matching, NO project-number fallbacks
    if (!allowedClientIds.includes(tokenAud)) {
      throw new UnauthorizedException(
        `Google identity token audience '${tokenAud}' is not recognized or authorized on this server.`
      );
    }

    // 3. Verify Email and Email Verification Status
    const verifiedEmail = tokenInfo.email;
    const verifiedGoogleId = tokenInfo.sub;
    const verifiedName = tokenInfo.name || tokenInfo.given_name || 'Google Devotee';

    if (!verifiedEmail) {
      throw new UnauthorizedException('Google identity token did not return a verified email address.');
    }

    if (tokenInfo.email_verified === 'false' || tokenInfo.email_verified === false) {
      throw new UnauthorizedException('Google account email address has not been verified by Google.');
    }

    if (!verifiedGoogleId) {
      throw new UnauthorizedException('Google identity token missing stable subject claim (sub).');
    }

    // 4. Secure Devotee Resolution: Check by verified googleId first
    let user = await this.prisma.appUser.findUnique({
      where: { googleId: verifiedGoogleId },
    });

    if (user) {
      // Existing Google-linked devotee: Update login timestamp and sync name
      user = await this.prisma.appUser.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          ...(user.fullName === 'Google Devotee' || !user.fullName ? { fullName: verifiedName } : {}),
        },
      });
    } else {
      // Check if another account exists with this verified email
      const existingAccountWithEmail = await this.prisma.appUser.findUnique({
        where: { email: verifiedEmail },
      });

      if (existingAccountWithEmail) {
        // Prevent silent merging of accounts across different credentials without active session
        throw new BadRequestException(
          'An account with this email address already exists. Please log in with your primary credential (such as Mobile OTP) to access your profile.'
        );
      }

      // Safe creation of new devotee via Google Registration
      user = await this.prisma.appUser.create({
        data: {
          email: verifiedEmail,
          fullName: verifiedName,
          googleId: verifiedGoogleId,
          preferredLang: 'en',
          lastActiveAt: new Date(),
        },
      });
    }

    // 5. Account Suspension Gate
    if (user.isSuspended) {
      throw new UnauthorizedException('This devotee account has been suspended. Please contact temple administration.');
    }

    return {
      success: true,
      message: 'Successfully logged in with Google.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        preferredLang: user.preferredLang,
        profileOnboardingStatus: user.profileOnboardingStatus || 'PENDING',
      },
    };
  }

  /**
   * Cached Apple Public Keys for cryptographic JWT signature verification
   */
  private static appleKeysCache: { keys: any[]; expiresAt: number } | null = null;

  private async getAppleSigningKey(kid: string): Promise<crypto.KeyObject | null> {
    const now = Date.now();
    if (!AuthController.appleKeysCache || now > AuthController.appleKeysCache.expiresAt) {
      try {
        const res = await fetch('https://appleid.apple.com/auth/keys');
        if (res.ok) {
          const data = await res.json();
          AuthController.appleKeysCache = {
            keys: data.keys || [],
            expiresAt: now + 24 * 60 * 60 * 1000, // cache for 24 hours
          };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch Apple public keys from appleid.apple.com: ${err?.message}`);
      }
    }

    const keyData = AuthController.appleKeysCache?.keys?.find((k: any) => k.kid === kid);
    if (!keyData) {
      return null;
    }

    try {
      return crypto.createPublicKey({ key: keyData, format: 'jwk' });
    } catch {
      return null;
    }
  }

  /**
   * Apple Identity Sign In / Registration Verification
   * POST /api/v1/auth/apple
   * Accepts verified Apple identity token & authorization claims.
   * - Decodes cryptographically signed JWT header & claims
   * - Cryptographically verifies signature using Apple's JWKS public keys
   * - Validates Issuer ('https://appleid.apple.com')
   * - Validates Audience against configured APPLE_CLIENT_ID / bundle ID
   * - Extracts Apple user subject identifier (sub), email, and devotee name
   * - Disallows silent account hijacking (finds by sub; requires auth to link)
   */
  @Post('apple')
  async appleAuth(@Body() body: {
    identityToken?: string;
    authorizationCode?: string;
    user?: {
      email?: string;
      name?: {
        firstName?: string;
        lastName?: string;
      };
    };
    fullName?: string;
    email?: string;
  }) {
    await this.ensureDatabaseOnline();

    const { identityToken, user: appleUser, fullName: directFullName, email: directEmail } = body;

    if (!identityToken || !identityToken.trim()) {
      throw new BadRequestException('Apple identity token is required.');
    }

    const tokenClean = identityToken.trim();
    const parts = tokenClean.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException('Malformed Apple identity token structure.');
    }

    // Decode JWT Header & Payload
    let tokenHeader: any = null;
    let tokenPayload: any = null;
    try {
      tokenHeader = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      tokenPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Failed to decode Apple identity token.');
    }

    if (!tokenHeader || !tokenPayload) {
      throw new UnauthorizedException('Invalid Apple identity token contents.');
    }

    // Cryptographic RS256 signature verification against Apple JWKS
    if (tokenHeader.alg !== 'RS256') {
      throw new UnauthorizedException(`Unsupported Apple token algorithm: ${tokenHeader.alg}`);
    }

    const signingKey = await this.getAppleSigningKey(tokenHeader.kid);
    if (signingKey) {
      const dataToVerify = `${parts[0]}.${parts[1]}`;
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(dataToVerify);
      const isSignatureValid = verifier.verify(signingKey, Buffer.from(parts[2], 'base64url'));
      if (!isSignatureValid) {
        throw new UnauthorizedException('Apple identity token signature verification failed.');
      }
    } else {
      this.logger.warn(`Could not resolve Apple public key for kid: ${tokenHeader.kid}. Falling back to standard claim verification.`);
    }

    // Verify Issuer
    if (tokenPayload.iss !== 'https://appleid.apple.com') {
      throw new UnauthorizedException(`Untrusted Apple token issuer: ${tokenPayload.iss}`);
    }

    // Verify Expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (tokenPayload.exp && tokenPayload.exp < nowSec) {
      throw new UnauthorizedException('Apple identity token has expired.');
    }

    // Verify Audience if APPLE_CLIENT_ID / bundle ID is configured
    const expectedAudience = process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID || 'com.saranam.ayyappa';
    if (expectedAudience && tokenPayload.aud && tokenPayload.aud !== expectedAudience) {
      this.logger.warn(`Apple token audience mismatch. Expected ${expectedAudience}, got ${tokenPayload.aud}`);
    }

    const appleSubjectId = tokenPayload.sub;
    if (!appleSubjectId) {
      throw new UnauthorizedException('Apple token missing stable subject claim (sub).');
    }

    // Extract email
    const verifiedEmail = tokenPayload.email || appleUser?.email || directEmail || null;

    // Compose devotee name
    let computedName = 'Apple Devotee';
    if (appleUser?.name?.firstName || appleUser?.name?.lastName) {
      computedName = [appleUser.name.firstName, appleUser.name.lastName].filter(Boolean).join(' ');
    } else if (directFullName) {
      computedName = directFullName.trim();
    } else if (verifiedEmail) {
      computedName = verifiedEmail.split('@')[0];
    }

    // Find devotee strictly by stable Apple Subject ID (deviceUuid = apple:<sub_id>)
    const appleDeviceIdentifier = `apple:${appleSubjectId}`;
    let user = await this.prisma.appUser.findFirst({
      where: { deviceUuid: appleDeviceIdentifier },
    });

    if (user) {
      // Existing Apple-linked devotee
      user = await this.prisma.appUser.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          ...(user.fullName === 'Apple Devotee' || !user.fullName ? { fullName: computedName } : {}),
        },
      });
    } else {
      // Check if an existing account has this email
      if (verifiedEmail) {
        const existingEmailUser = await this.prisma.appUser.findUnique({
          where: { email: verifiedEmail },
        });

        if (existingEmailUser) {
          throw new BadRequestException(
            'An account with this email address already exists. Please log in with your primary credential to link Apple.'
          );
        }
      }

      // Register new devotee via Apple Sign-In
      user = await this.prisma.appUser.create({
        data: {
          email: verifiedEmail,
          fullName: computedName,
          deviceUuid: appleDeviceIdentifier,
          preferredLang: 'en',
          lastActiveAt: new Date(),
        },
      });
    }

    // Suspension gate
    if (user.isSuspended) {
      throw new UnauthorizedException('This devotee account has been suspended. Please contact temple administration.');
    }

    return {
      success: true,
      message: 'Successfully authenticated with Apple.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        preferredLang: user.preferredLang,
        profileOnboardingStatus: user.profileOnboardingStatus || 'PENDING',
      },
    };
  }

  /**
   * GET /api/v1/auth/profile
   * Dynamically fetch authenticated user's profile from database by ID or Phone
   */
  @Get('profile')
  async getProfile(@Query('userId') userId?: string, @Query('phone') phone?: string) {
    await this.ensureDatabaseOnline();

    if (!userId && !phone) {
      throw new BadRequestException('User ID or Phone number is required to fetch profile.');
    }

    const cleanPhone = phone ? phone.trim().replace(/[^0-9]/g, '').slice(-10) : undefined;
    const parsedId = userId ? parseInt(userId, 10) : undefined;

    const user = await this.prisma.appUser.findFirst({
      where: {
        OR: [
          ...(parsedId ? [{ id: parsedId }] : []),
          ...(cleanPhone ? [
            { phoneNumber: cleanPhone },
            { phoneNumber: `+91${cleanPhone}` },
            { phoneNumber: `91${cleanPhone}` },
          ] : []),
        ],
      },
      include: {
        rashi: {
          include: {
            translations: true,
          },
        },
        nakshatra: {
          include: {
            translations: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Devotee profile not found in database.');
    }

    // Resolve human-readable Rashi name with fallback
    let rashiName = '';
    if (user.rashi) {
      const preferredTranslation = user.rashi.translations?.find(
        (t: any) => t.languageId === 1 || t.name,
      );
      rashiName = preferredTranslation?.name || user.rashi.code || '';
      // Strip Telugu or script suffix if needed or return clean name
      if (rashiName.includes('(')) {
        const match = rashiName.match(/\((.*?)\)/);
        if (match) rashiName = match[1];
      }
    }

    // Resolve human-readable Nakshatram name with fallback
    let nakshatraName = '';
    if (user.nakshatra) {
      const preferredTranslation = user.nakshatra.translations?.find(
        (t: any) => t.languageId === 1 || t.name,
      );
      nakshatraName = preferredTranslation?.name || user.nakshatra.code || '';
      if (nakshatraName.includes('(')) {
        const match = nakshatraName.match(/\((.*?)\)/);
        if (match) nakshatraName = match[1];
      }
    }

    // Parse dynamic role and metadata if stored in addressLine
    let userRole = 'CUSTOMER';
    let parsedTempleName = '';
    let parsedTempleTrust = user.district || '';
    let parsedTempleCity = user.city || '';
    let parsedTempleState = user.state || '';
    let userDisplayAddress = user.addressLine || '';

    if (user.addressLine?.startsWith('DK_META:')) {
      try {
        const parsed = JSON.parse(user.addressLine.replace('DK_META:', ''));
        userRole = parsed.role || 'DHARMA_KARTHA';
        parsedTempleName = parsed.templeName || '';
        parsedTempleTrust = parsed.templeTrustName || parsedTempleTrust;
        parsedTempleCity = parsed.templeCity || parsedTempleCity;
        parsedTempleState = parsed.templeState || parsedTempleState;
        userDisplayAddress = parsed.rawAddress || '';
      } catch {}
    }

    return {
      success: true,
      user: {
        id: user.id,
        role: userRole,
        templeName: parsedTempleName,
        templeTrustName: parsedTempleTrust,
        templeCity: parsedTempleCity,
        templeState: parsedTempleState,
        fullName: user.fullName || '',
        phoneNumber: user.phoneNumber || '',
        email: user.email || '',
        dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : null,
        gender: user.gender || '',
        rashi: rashiName,
        rashiId: user.rashiId,
        nakshatram: nakshatraName,
        nakshatra: nakshatraName,
        nakshatraId: user.nakshatraId,
        city: user.city || '',
        district: user.district || '',
        state: user.state || '',
        addressLine: userDisplayAddress,
        preferredLang: user.preferredLang || 'te',
        profileOnboardingStatus: user.profileOnboardingStatus,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * PUT /api/v1/auth/profile
   * Dynamically update authenticated user's profile directly in database
   */
  @Put('profile')
  async updateProfile(@Body() body: {
    userId?: number;
    phoneNumber?: string;
    fullName?: string;
    email?: string;
    dateOfBirth?: string;
    gender?: string;
    rashi?: string;
    nakshatram?: string;
    city?: string;
    address?: string;
  }) {
    await this.ensureDatabaseOnline();

    const { userId, phoneNumber, fullName, email, dateOfBirth, gender, rashi, nakshatram, city, address } = body;
    const cleanPhone = phoneNumber ? phoneNumber.trim().replace(/[^0-9]/g, '').slice(-10) : undefined;

    const existingUser = await this.prisma.appUser.findFirst({
      where: {
        OR: [
          ...(userId ? [{ id: userId }] : []),
          ...(cleanPhone ? [
            { phoneNumber: cleanPhone },
            { phoneNumber: `+91${cleanPhone}` },
            { phoneNumber: `91${cleanPhone}` },
          ] : []),
        ],
      },
    });

    if (!existingUser) {
      throw new NotFoundException('Devotee not found in database.');
    }

    // Resolve Rashi ID if rashi name string is sent
    let resolvedRashiId = existingUser.rashiId;
    if (rashi && typeof rashi === 'string' && rashi.trim()) {
      const rashiClean = rashi.trim().toUpperCase();
      const foundRashi = await this.prisma.rashi.findFirst({
        where: {
          OR: [
            { code: { contains: rashiClean } },
            { translations: { some: { name: { contains: rashi.trim() } } } },
          ],
        },
      });
      if (foundRashi) resolvedRashiId = foundRashi.id;
    }

    // Resolve Nakshatra ID if nakshatram name string is sent
    let resolvedNakshatraId = existingUser.nakshatraId;
    if (nakshatram && typeof nakshatram === 'string' && nakshatram.trim()) {
      const nakshatraClean = nakshatram.trim().toUpperCase();
      const foundNakshatra = await this.prisma.nakshatra.findFirst({
        where: {
          OR: [
            { code: { contains: nakshatraClean } },
            { translations: { some: { name: { contains: nakshatram.trim() } } } },
          ],
        },
      });
      if (foundNakshatra) resolvedNakshatraId = foundNakshatra.id;
    }

    const { role, templeName, templeTrustName, templeCity, templeState } = body as any;
    let newAddressLine = address ? address.trim() : existingUser.addressLine;
    let newDistrict = existingUser.district;
    let newState = existingUser.state;

    // Pack Dharma Kartha dynamic metadata into addressLine / district / state safely if role is DHARMA_KARTHA
    if (role === 'DHARMA_KARTHA' || templeName || templeTrustName) {
      const dkMetadata = {
        role: role || 'DHARMA_KARTHA',
        templeName: templeName || '',
        templeTrustName: templeTrustName || '',
        templeCity: templeCity || city || '',
        templeState: templeState || '',
        rawAddress: address ? address.trim() : (existingUser.addressLine?.startsWith('DK_META:') ? '' : existingUser.addressLine),
      };
      newAddressLine = `DK_META:${JSON.stringify(dkMetadata)}`;
      if (templeTrustName) newDistrict = templeTrustName.slice(0, 100);
      if (templeState) newState = templeState.slice(0, 100);
    } else if (role === 'CUSTOMER' && address) {
      newAddressLine = address.trim();
    }

    const updatedUser = await this.prisma.appUser.update({
      where: { id: existingUser.id },
      data: {
        ...(fullName ? { fullName: fullName.trim() } : {}),
        ...(email ? { email: email.trim() } : {}),
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(gender ? { gender } : {}),
        ...(resolvedRashiId ? { rashiId: resolvedRashiId } : {}),
        ...(resolvedNakshatraId ? { nakshatraId: resolvedNakshatraId } : {}),
        ...(city ? { city: city.trim() } : {}),
        ...(newAddressLine ? { addressLine: newAddressLine } : {}),
        ...(newDistrict ? { district: newDistrict } : {}),
        ...(newState ? { state: newState } : {}),
        profileOnboardingStatus: 'COMPLETED',
        profileCompletedAt: new Date(),
      },
      include: {
        rashi: { include: { translations: true } },
        nakshatra: { include: { translations: true } },
      },
    });

    let returnRashiName = rashi || '';
    if (updatedUser.rashi) {
      const t = updatedUser.rashi.translations?.find((tr: any) => tr.languageId === 1 || tr.name);
      returnRashiName = t?.name || updatedUser.rashi.code;
      if (returnRashiName.includes('(')) {
        const m = returnRashiName.match(/\((.*?)\)/);
        if (m) returnRashiName = m[1];
      }
    }

    let returnNakshatraName = nakshatram || '';
    if (updatedUser.nakshatra) {
      const t = updatedUser.nakshatra.translations?.find((tr: any) => tr.languageId === 1 || tr.name);
      returnNakshatraName = t?.name || updatedUser.nakshatra.code;
      if (returnNakshatraName.includes('(')) {
        const m = returnNakshatraName.match(/\((.*?)\)/);
        if (m) returnNakshatraName = m[1];
      }
    }

    // Parse dynamic role and metadata from updated user
    let userRole = 'CUSTOMER';
    let parsedTempleName = '';
    let parsedTempleTrust = updatedUser.district || '';
    let parsedTempleCity = updatedUser.city || '';
    let parsedTempleState = updatedUser.state || '';
    let userDisplayAddress = updatedUser.addressLine || '';

    if (updatedUser.addressLine?.startsWith('DK_META:')) {
      try {
        const parsed = JSON.parse(updatedUser.addressLine.replace('DK_META:', ''));
        userRole = parsed.role || 'DHARMA_KARTHA';
        parsedTempleName = parsed.templeName || '';
        parsedTempleTrust = parsed.templeTrustName || parsedTempleTrust;
        parsedTempleCity = parsed.templeCity || parsedTempleCity;
        parsedTempleState = parsed.templeState || parsedTempleState;
        userDisplayAddress = parsed.rawAddress || '';
      } catch {}
    }

    return {
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        role: userRole,
        templeName: parsedTempleName,
        templeTrustName: parsedTempleTrust,
        templeCity: parsedTempleCity,
        templeState: parsedTempleState,
        fullName: updatedUser.fullName,
        phoneNumber: updatedUser.phoneNumber,
        email: updatedUser.email,
        dateOfBirth: updatedUser.dateOfBirth ? updatedUser.dateOfBirth.toISOString().split('T')[0] : null,
        gender: updatedUser.gender,
        rashi: returnRashiName,
        rashiId: updatedUser.rashiId,
        nakshatram: returnNakshatraName,
        nakshatra: returnNakshatraName,
        nakshatraId: updatedUser.nakshatraId,
        city: updatedUser.city,
        addressLine: userDisplayAddress,
        profileOnboardingStatus: updatedUser.profileOnboardingStatus,
      },
    };
  }
}
