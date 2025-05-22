const fs = require('node:fs');

/**
 * @function
 * @param {string} path
 * @returns {string}
 */
const readFile = path => fs.readFileSync(path, 'utf8');

/**
 * @typedef Dependency
 * @property {string} name
 * @property {string | null} version
*/

/**
 * @param {string} dependency
 * @returns {Dependency}
 */
function parseVersion(dependency) {
	const {name, version} = /^(?<name>@?[a-z-/.0-9[\]]+)((@|==)(?<version>.+))?$/i.exec(dependency)?.groups ?? {name: '', version: null};
	return {
		name,
		version: version ?? null,
	};
}

/**
 * Simple function to escape regular expressions so that they can be used as regular strings in a (different)
 * regular expression
 *
 * @param {string} string
 * @returns {string}
 */
function escapeRegex(string) {
	/** @type {function(string): string} */
	let escape;
	if ('escape' in RegExp && typeof RegExp.escape === 'function') {
		// @ts-expect-error TypeScript is not aware of the new escape function
		({escape} = RegExp);
	} else {
		escape = string => (
			string
				.replace(/\[/g, '\\[')
				.replace(/]/g, '\\]')
		);
	}

	return escape(string);
}

module.exports = {
	readFile,
	parseVersion,
	escapeRegex,
};
