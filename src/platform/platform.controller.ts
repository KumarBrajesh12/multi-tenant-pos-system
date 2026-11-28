import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { CreateMerchantDto, UpdateMerchantDto } from './dto/merchant.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformService } from './platform.service';

@ApiTags('Platform admin')
@ApiBearerAuth('jwt')
@UseGuards(PlatformAdminGuard)
@Controller('platform/merchants')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Post()
  @ApiOperation({ summary: 'Onboard a merchant and invite its first admin (returns the invite token)' })
  create(@CurrentUser() admin: AuthUser, @Body() dto: CreateMerchantDto) {
    return this.platform.createMerchant(admin, dto);
  }

  @Get()
  @ApiOperation({ summary: 'All merchants with store/member counts' })
  list(@Query() query: PaginationQueryDto) {
    return this.platform.listMerchants(query);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Rename or suspend/reactivate a merchant' })
  update(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ResourceNotFoundException('Merchant') })) id: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    return this.platform.updateMerchant(id, dto);
  }
}
