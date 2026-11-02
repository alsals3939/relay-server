import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateKnowledgeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  answer!: string;
}
