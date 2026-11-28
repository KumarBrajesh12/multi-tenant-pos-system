import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../access/role.enum';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateInvitationDto {
  @ApiProperty({ example: 'new.cashier@acme.test' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ enum: Role, example: Role.CASHIER })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for STORE_MANAGER / CASHIER, omit for MERCHANT_ADMIN' })
  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Token returned when the invitation was created' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @ApiPropertyOptional({ example: 'Nina New', description: 'Required when the email has no account yet' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @ApiProperty({ description: 'New password, or the current one if the email already has an account' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
