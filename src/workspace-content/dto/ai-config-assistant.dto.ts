import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AiConfigAssistantMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(5000)
  content!: string;
}

export class AiConfigAssistantDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AiConfigAssistantMessageDto)
  messages!: AiConfigAssistantMessageDto[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  currentSystemPrompt?: string;
}
