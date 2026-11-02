import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyMissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer!: string;
}
