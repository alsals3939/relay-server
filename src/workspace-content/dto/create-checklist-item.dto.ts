import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
