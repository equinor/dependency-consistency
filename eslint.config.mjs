import globals from 'globals';
import tseslint from 'typescript-eslint';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import xoTypescript from 'eslint-config-xo-typescript';

export default [
	{files: ['**/*.js'], languageOptions: {sourceType: 'commonjs'}},
	{languageOptions: {globals: globals.node}},
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	...xoTypescript,
	...tseslint.configs.recommended,
	{
		rules: {
			// We are using CommonJS for wider compatibility
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-var-requires': 'off',

			// Disable formatting from TypeScript
			'@typescript-eslint/naming-convention': 'off',
			// We are using tsc with JSDoc to specify types
			'@typescript-eslint/no-unsafe-assignment': 'off',
		},
		files: ['**/*.cjs'],
	},
];
