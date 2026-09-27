import { execSync } from 'node:child_process';

/** Applies migrations to the dedicated test database before the suite runs. */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/doorstep_test?schema=public';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
