import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateStoreDto {
  @ApiProperty({ example: 'ACME-MALL', description: 'Unique per merchant. Stored upper-case.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{1,50}$/, { message: 'code may only contain letters, digits, "_" and "-" (max 50)' })
  code: string;

  @ApiProperty({ example: 'Acme City Mall' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Level 2, City Mall' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class UpdateStoreDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'false closes the store: no sales, staff lose access to it' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
