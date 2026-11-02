import { IsBoolean } from 'class-validator';

export class UpdateMissionCompletionDto {
  @IsBoolean()
  completed!: boolean;
}
