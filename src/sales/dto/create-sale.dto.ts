import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../payments/entities/payment.entity';

export class SaleItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

export class SalePaymentDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CARD })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({
    example: 'tok_visa',
    description: 'Card/wallet token. Mock provider: tok_declined, tok_insufficient_funds, tok_timeout',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  token?: string;
}

// no prices/totals, those come from the catalogue
export class CreateSaleDto {
  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique((item: SaleItemDto) => item?.productId, {
    message: 'each product can only appear once, use quantity instead',
  })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ type: SalePaymentDto })
  @ValidateNested()
  @Type(() => SalePaymentDto)
  payment: SalePaymentDto;
}
