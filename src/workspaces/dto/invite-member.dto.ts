import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import type { WorkspaceRole } from '../../../generated/prisma/enums';

export class InviteMemberDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'])
  role?: Extract<WorkspaceRole, 'ADMIN' | 'MEMBER'>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleGroupIds?: string[];
}
