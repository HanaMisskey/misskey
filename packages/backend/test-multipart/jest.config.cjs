module.exports = {
	transform: {
		'^.+\\.(t|j)sx?$': ['@swc/jest'],
	},
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	rootDir: '..',
	testMatch: [
		'<rootDir>/test-multipart/test/**/*.test.ts',
	],
	testTimeout: 120000,
	maxWorkers: 1,
	testEnvironment: 'node',
};
