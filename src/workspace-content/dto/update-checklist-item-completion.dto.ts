import { IsBoolean } from 'class-validator';

export class UpdateChecklistItemCompletionDto {
  @IsBoolean()
  completed!: boolean;
}
