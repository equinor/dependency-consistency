const fs = require('node:fs');

/**
 * @function
 * @param {string} path
 * @returns {string}
 */
const readFile = (path) => fs.readFileSync(path, 'utf8');

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
	const {name, version} = /^(?<name>@?[a-z-/0-9]+)((@|==)(?<version>.+))?$/.exec(dependency)?.groups ?? {name: '', version: null};
	return {
		name,
		version: version ?? null,
	};
}

module.exports = {
	readFile,
	parseVersion,
};