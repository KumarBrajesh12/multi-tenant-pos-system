import { existsSync } from 'fs';
import * as dotenv from 'dotenv';

// Force the test profile so ConfigModule / data-source load `.env.test`.
process.env.NODE_ENV = 'test';

// No local .env.test yet? Fall back to the committed template (no secrets in it).
if (!existsSync('.env.test')) {
  dotenv.config({ path: '.env.test.example' });
}
