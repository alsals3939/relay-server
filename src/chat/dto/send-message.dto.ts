import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  roleGroupId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;
}
