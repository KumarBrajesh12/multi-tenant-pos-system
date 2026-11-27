import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, NotEquals } from 'class-validator';
import { MovementReason } from '../entities/inventory-movement.entity';

// SALE / SALE_REVERSAL are only written by the sales flow
export const MANUAL_REASONS = [
  MovementReason.RESTOCK,
  MovementReason.ADJUSTMENT,
  MovementReason.DAMAGE,
  MovementReason.RETURN,
] as const;

export class AdjustInventoryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 10, description: 'Positive to add stock, negative to remove' })
  @IsInt()
  @NotEquals(0)
  @Min(-100_000)
  @Max(100_000)
  quantityDelta: number;

  @ApiProperty({ enum: MANUAL_REASONS, example: MovementReason.RESTOCK })
  @IsIn(MANUAL_REASONS)
  reason: MovementReason;

  @ApiPropertyOptional({ example: 'Weekly delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
