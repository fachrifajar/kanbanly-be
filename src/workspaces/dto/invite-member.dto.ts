import {
  IsArray,
  IsEmail,
  IsEnum,
  ArrayMinSize,
  ValidateNested,
  IsNotEmpty,
  ArrayMaxSize,
  ArrayNotEmpty,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WorkspaceRole } from '@prisma/client';

@ValidatorConstraint({ name: 'IsNotOwnerRole', async: false })
class IsNotOwnerRoleConstraint implements ValidatorConstraintInterface {
  validate(role: WorkspaceRole) {
    return role !== WorkspaceRole.OWNER;
  }

  defaultMessage() {
    return `'OWNER' role is not allowed for invitation.`;
  }
}

class InvitationItemDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(WorkspaceRole)
  @IsNotEmpty()
  @Validate(IsNotOwnerRoleConstraint)
  role: WorkspaceRole;
}

export class InviteMemberDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => InvitationItemDto)
  invitations: InvitationItemDto[];
}
