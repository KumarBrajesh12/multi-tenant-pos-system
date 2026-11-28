import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Role } from '../../access/role.enum';

export class UpdateMembershipDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for STORE_MANAGER / CASHIER' })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}
