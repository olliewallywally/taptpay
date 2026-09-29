module.exports = {
  displayName: 'client',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/client/src'],
  testMatch: [
    '<rootDir>/client/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/client/src/**/*.(test|spec).{js,jsx,ts,tsx}',
  ],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  transformIgnorePatterns: ['/node_modules/(?!(wouter|nanoid)/)'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: { jsx: 'react-jsx' },
        isolatedModules: true,
        diagnostics: { ignoreCodes: [1343] },
        astTransformers: {
          before: ['<rootDir>/jest.import-meta-transformer.cjs'],
        },
      },
    ],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png|jpg|jpeg|webp|avif)$': 'jest-transform-stub',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@assets/(.*)$': '<rootDir>/attached_assets/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'client/src/**/*.{ts,tsx}',
    '!client/src/**/*.d.ts',
    '!client/src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage/client',
  coverageReporters: ['text', 'lcov'],
};
