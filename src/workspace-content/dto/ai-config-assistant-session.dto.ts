import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAiConfigAssistantSessionDto {
  @IsUUID()
  roleGroupId!: string;
}

export class SendAiConfigAssistantMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  currentSystemPrompt?: string;
}
