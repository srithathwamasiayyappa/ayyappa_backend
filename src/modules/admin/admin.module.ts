import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaService } from '../../database/prisma.service';
import { TranslationService } from './translation.service';
import { DharmaKarthaModule } from '../dharma-kartha/dharma-kartha.module';

@Module({
  imports: [DharmaKarthaModule],
  controllers: [AdminController],
  providers: [PrismaService, TranslationService],
  exports: [PrismaService, TranslationService],
})
export class AdminModule {}
