import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_MAX_LENGTH = 72;

function IsSameAs(property: string, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSameAs',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedProperty] = args.constraints as [string];
          return value === (args.object as Record<string, unknown>)[relatedProperty];
        },
      },
    });
  };
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/\S/, { message: 'currentPassword must not be whitespace-only' })
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/\S/, { message: 'newPassword must not be whitespace-only' })
  newPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/\S/, { message: 'confirmPassword must not be whitespace-only' })
  @IsSameAs('newPassword', { message: 'Yangi parollar mos emas' })
  confirmPassword!: string;
}
