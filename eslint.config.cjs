const globals = require('globals');
const tseslint = require('typescript-eslint');

const {FlatCompat} = require('@eslint/eslintrc');
const pluginJs = require('@eslint/js');

const compat = new FlatCompat({baseDirectory: __dirname, recommendedConfig: pluginJs.configs.recommended});

module.exports = [
	{files: ['**/*.js'], languageOptions: {sourceType: 'commonjs'}},
	{languageOptions: {globals: globals.node}},
	...compat.extends('xo-typescript'),
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