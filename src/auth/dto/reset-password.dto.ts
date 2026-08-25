import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'token must contain a non-whitespace character' })
  token!: string;

  @IsString()
  @Length(8, 72)
  @Matches(/\S/, { message: 'newPassword must contain a non-whitespace character' })
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;
}
