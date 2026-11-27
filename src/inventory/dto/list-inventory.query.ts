import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListInventoryQuery extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches product name or SKU' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Only items with quantity <= this value (low stock report)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxQuantity?: number;
}
