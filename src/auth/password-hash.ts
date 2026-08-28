import * as bcrypt from 'bcryptjs';

export const hashPassword = (password: string, saltRounds: number): Promise<string> => bcrypt.hash(password, saltRounds);
