process.env.DATABASE_URL ??= 'postgresql://postgres@localhost:5432/yechim_ai?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-that-is-at-least-32-chars';
process.env.JWT_REFRESH_SECRET ??= 'test-only-refresh-secret-that-is-at-least-32-chars';
process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '30d';
process.env.BCRYPT_SALT_ROUNDS ??= '10';
process.env.PORT ??= '3001';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
