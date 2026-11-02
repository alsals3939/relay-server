import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignMemberRoleGroupsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleGroupIds!: string[];
}
