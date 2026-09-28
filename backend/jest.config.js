/** Unit tests. E2E has its own config at test/jest-e2e.json. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { strictPropertyInitialization: false } }] },
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!**/index.ts'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
