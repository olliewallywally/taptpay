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
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15_000,
  coverageDirectory: 'coverage/server',
};
