import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateKnowledgeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  answer?: string;
}
