module.exports = {
  displayName: 'server',
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  testMatch: [
    '<rootDir>/server/**/__tests__/**/*.test.ts',
    '<rootDir>/server/**/*.test.ts',
  ],
  moduleFileExtensions: ['js', 'ts', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
        },
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  setupFiles: [
    '<rootDir>/server/__tests__/support/clear-ambient-credentials.ts',
    // R1-T1: refuse and record any connection off this machine...
    '<rootDir>/server/__tests__/support/no-network.ts',
  ],
  // ...and fail the test that made it.
  setupFilesAfterEnv: ['<rootDir>/server/__tests__/support/no-network-after-env.ts'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15_000,
  coverageDirectory: 'coverage/server',
};
