import { Logger } from '@nestjs/common';
import AppDataSource from '../data-source';
import { SEED_PASSWORD, users } from './seed-data';
import { seedDatabase } from './seed';

const logger = new Logger('Seed');

async function main(): Promise<void> {
  // the seed wipes all data first, so be careful outside dev
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    logger.error('Refusing to seed with NODE_ENV=production. Pass --force if you really mean it.');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const pending = await AppDataSource.showMigrations();
    if (pending) {
      logger.error('There are pending migrations, run `npm run migration:run` first.');
      process.exitCode = 1;
      return;
    }

    await seedDatabase(AppDataSource);

    logger.log(`Seeded database "${AppDataSource.options.database}"`);
    logger.log(`Users (password for all: ${SEED_PASSWORD}):`);
    for (const u of users) logger.log(`  - ${u.email}`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
