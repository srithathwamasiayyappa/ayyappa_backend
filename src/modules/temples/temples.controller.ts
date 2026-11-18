import { Controller, Get, Param, Query } from '@nestjs/common';
import { TemplesService } from './temples.service';

@Controller('temples')
export class TemplesController {
  constructor(private readonly templesService: TemplesService) {}

  @Get()
  async getTemples(
    @Query('lang') lang?: string,
    @Query('q') q?: string,
    @Query('deity') deity?: string,
  ) {
    const data = await this.templesService.getTemples({ lang, q, deity });
    return {
      success: true,
      data,
      total: data.length,
    };
  }

  @Get(':id')
  async getTempleById(
    @Param('id') id: string,
    @Query('lang') lang?: string,
  ) {
    const data = await this.templesService.getTempleById(id, lang);
    return {
      success: true,
      data,
    };
  }
}
