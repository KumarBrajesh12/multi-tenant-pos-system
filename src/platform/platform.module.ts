import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [MembersModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
