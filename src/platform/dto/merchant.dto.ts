import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateMerchantDto {
  @ApiProperty({ example: 'Corner Bakery' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'corner-bakery', description: 'Lowercase letters, digits and dashes. Unique.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug may only contain lowercase letters, digits and dashes' })
  @MaxLength(100)
  slug: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;

  @ApiProperty({ example: 'owner@cornerbakery.test', description: 'Gets an invitation as MERCHANT_ADMIN' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(320)
  ownerEmail: string;
}

export class UpdateMerchantDto {
  @ApiPropertyOptional({ example: 'Corner Bakery & Cafe' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'false suspends the merchant: nobody can access its data until reactivated' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
