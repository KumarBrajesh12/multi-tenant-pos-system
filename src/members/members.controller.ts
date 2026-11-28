import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequirePermission, Tenant } from '../access/decorators';
import { Permission } from '../access/permissions';
import { TenantContext } from '../access/tenant-context';
import { Public } from '../common/decorators/public.decorator';
import { ResourceNotFoundException } from '../common/exceptions/app.exception';
import { AcceptInvitationDto, CreateInvitationDto } from './dto/invitation.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { InvitationsService } from './invitations.service';
import { MembersService } from './members.service';

const idPipe = (resource: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => new ResourceNotFoundException(resource) });

@ApiTags('Members & invitations')
@ApiBearerAuth('jwt')
@ApiParam({ name: 'merchantId', format: 'uuid' })
@Controller('merchants/:merchantId')
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get('members')
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiOperation({ summary: 'Everyone with access to this merchant (merchant admin)' })
  listMembers(@Tenant() tenant: TenantContext) {
    return this.members.list(tenant);
  }

  @Patch('members/:membershipId')
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOperation({ summary: 'Change role / store of a membership (merchant admin)' })
  changeRole(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', idPipe('Membership')) membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.members.changeRole(tenant, membershipId, dto);
  }

  @Delete('members/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOperation({ summary: 'Remove access (merchant admin). The last admin cannot be removed.' })
  async removeMember(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', idPipe('Membership')) membershipId: string,
  ) {
    await this.members.remove(tenant, membershipId);
  }

  @Post('invitations')
  @RequirePermission(Permission.MEMBER_INVITE)
  @ApiOperation({
    summary: 'Invite someone (admin: any role; manager: cashiers for their own store). Returns a one-time token.',
  })
  invite(@Tenant() tenant: TenantContext, @Body() dto: CreateInvitationDto) {
    return this.invitations.invite(tenant, dto);
  }

  @Get('invitations')
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiOperation({ summary: 'Open invitations (merchant admin)' })
  listInvitations(@Tenant() tenant: TenantContext) {
    return this.invitations.listOpen(tenant);
  }

  @Delete('invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.MEMBER_MANAGE)
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiOperation({ summary: 'Revoke an open invitation (merchant admin)' })
  async revoke(
    @Tenant() tenant: TenantContext,
    @Param('invitationId', idPipe('Invitation')) invitationId: string,
  ) {
    await this.invitations.revoke(tenant, invitationId);
  }
}

@ApiTags('Members & invitations')
@Controller('invitations')
export class InvitationAcceptController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an invitation (creates the account if needed) and log in' })
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto);
  }
}
