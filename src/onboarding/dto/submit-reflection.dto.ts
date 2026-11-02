import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitReflectionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
