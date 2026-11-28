import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator';

@ApiTags('Health')
@Public()
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'API info and useful links' })
  info() {
    return {
      name: 'Multi-Tenant POS API',
      version: '1.0.0',
      docs: '/docs',
      health: '/health',
      login: 'POST /auth/login',
    };
  }
}
