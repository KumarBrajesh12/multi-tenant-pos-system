import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';
import { InvitationAcceptController, MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MembershipsRepository } from './memberships.repository';

@Module({
  imports: [AuthModule],
  controllers: [MembersController, InvitationAcceptController],
  providers: [MembershipsRepository, InvitationsRepository, InvitationsService, MembersService],
  exports: [InvitationsService],
})
export class MembersModule {}
