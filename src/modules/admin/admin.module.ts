import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaService } from '../../database/prisma.service';
import { TranslationService } from './translation.service';

@Module({
  controllers: [AdminController],
  providers: [PrismaService, TranslationService],
  exports: [PrismaService, TranslationService],
})
export class AdminModule {}
