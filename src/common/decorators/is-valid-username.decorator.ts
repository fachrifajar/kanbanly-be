import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsValidUsernameConstraint implements ValidatorConstraintInterface {
  validate(username: string, args: ValidationArguments) {
    if (typeof username !== 'string') return false;

    const baseRegex = /^(?![_.])(?!.*[_.]{2})[a-z0-9._]+(?<![_.])$/;
    if (!baseRegex.test(username)) {
      return false;
    }

    if (username.length < 3 || username.length > 20) {
      return false;
    }

    const specialCharCount = (username.match(/[._]/g) || []).length;
    if (specialCharCount > 2) {
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Username is not valid. Please check the rules.';
  }
}

export function IsValidUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidUsernameConstraint,
    });
  };
}
