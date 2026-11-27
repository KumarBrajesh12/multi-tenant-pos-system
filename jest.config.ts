import type { Config } from 'jest';

const shared = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
} satisfies Partial<Config>;

const config: Config = {
  projects: [
    {
      ...shared,
      displayName: 'unit',
      rootDir: 'src',
      testRegex: '.*\\.spec\\.ts$',
    },
    {
      ...shared,
      displayName: 'e2e',
      rootDir: '.',
      testRegex: 'test/.*\\.e2e-spec\\.ts$',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
  ],
};

export default config;
