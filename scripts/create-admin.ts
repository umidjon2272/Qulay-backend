import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth/password-hash';

const ADMIN_EMAIL = 'admin@qulay.ai';
const prisma = new PrismaClient();

const getSaltRounds = (): number => {
  const saltRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10);
  if (!Number.isInteger(saltRounds) || saltRounds < 10 || saltRounds > 14) {
    throw new Error('BCRYPT_SALT_ROUNDS must be an integer between 10 and 14');
  }
  return saltRounds;
};

const createTemporaryPassword = (): string => randomBytes(24).toString('base64url');

const createAdmin = async (): Promise<void> => {
  const temporaryPassword = createTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword, getSaltRounds());

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'Qulay',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // Deliberately print credentials only after the database write succeeds.
  console.log(`Admin account ready\nEmail: ${ADMIN_EMAIL}\nTemporary password: ${temporaryPassword}`);
};

createAdmin()
  .catch(() => {
    console.error('Admin account provisioning failed. Check DATABASE_URL and database migrations.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
