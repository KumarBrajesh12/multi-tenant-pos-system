import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MerchantsService } from './merchants.service';

@ApiTags('Merchants')
@ApiBearerAuth('jwt')
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  @ApiOperation({ summary: 'Merchants the current user is a member of' })
  list(@CurrentUser() user: AuthUser) {
    return this.merchants.listForUser(user.id);
  }
}
