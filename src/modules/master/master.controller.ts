import { Controller, Get, Query } from '@nestjs/common';
import { MasterService } from './master.service';

@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Get('rashis')
  async getRashis(@Query('lang') lang?: string) {
    const rashis = await this.masterService.getRashis(lang || 'te');
    return {
      success: true,
      data: rashis,
    };
  }

  @Get('nakshatras')
  async getNakshatras(@Query('lang') lang?: string) {
    const nakshatras = await this.masterService.getNakshatras(lang || 'te');
    return {
      success: true,
      data: nakshatras,
    };
  }
}

