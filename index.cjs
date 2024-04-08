const fs = require('node:fs');
const path = require('node:path');
const lockfile = require('@yarnpkg/lockfile');
const YAML = require('yaml');
const semverSort = require('semver-sort');
const {readFile, parseVersion} = require('./shared.cjs');

if (process.argv.length < 3) {
	throw new Error('Lock file as argument is required');
}

const PRE_COMMIT_YAML = '.pre-commit-config.yaml';
const LOCK_FILE = process.argv[2];

/**
 * @param {string} file
 * @returns {Record<string, string[]>}
 */
function parseYarnLockFile(file) {
	const dependencies = lockfile.parse(readFile(file));
	return Object.keys(dependencies.object).reduce((mapping, dependency) => {
		const {name} = parseVersion(dependency);
		const installedVersion = dependencies.object[dependency].version;
		addElement(mapping, name, installedVersion);
		return mapping;
	}, {} /** @type {Record<string, string[]>} */);
}

/**
 * Helper function for pushing another value to a record of lists.
 * This helps with making TypeScript / JSDoc happy
 *
 * @template T
 * @param {Record<string, T[]>} mapping
 * @param {string} key
 * @param {T} value
 *
 * @returns {void}
 */
function addElement(mapping, key, value) {
	if (!(key in mapping)) mapping[key] = [];
	mapping[key].push(value);
}

/**
 * @param {string} file
 * @returns {Record<string, string[]>}
 */
function parseYarn3LockFile(file) {
	/** @typedef Dependencies
     * @property {{ version: number }} __metadata
     * */
	/** @type {Dependencies & Record<string, { version: string }>} */
	const dependencies = YAML.parse(readFile(file));
	if (![6, 8].includes(dependencies.__metadata.version)) {
		throw new Error('Unsupported format');
	}

	// delete dependencies.__metadata;
	return Object.keys(dependencies).reduce((mapping, dependency) => {
		if (dependency === '__metadata') return mapping;

		const parts =  dependency.split('@');
		const name = !parts[0] ? '@' + parts[1] : parts[0];
		const installedVersion = dependencies[dependency].version;
		addElement(mapping, name, installedVersion);
		return mapping;
	},
	/** @type {Record<string, string[]>} */
	{},
	);
}

/**
 * @param {string} file
 * @returns {Record<string, string[]>}
 */
function parsePackageLockFile(file) {
	/**
	 * @typedef Lockfile
	 * @property {number} lockfileVersion
	 * @property {Record<string, { version: string }>} packages
	 */
	/** @type {Lockfile} */
	const dependencies = JSON.parse(readFile(file));
	if (![2, 3].includes(dependencies.lockfileVersion)) throw new Error(`Unsupported version of package-lock.json (${dependencies.lockfileVersion})`);

	/**
     * @param {string} dependency
     * @returns {string}
     */
	function parseName(dependency) {
		let [name, namespace] = dependency.split('/').reverse();
		if (namespace.startsWith('@')) {
			name = namespace + '/' + name;
		}

		return name;
	}

	return Object.keys(dependencies.packages).filter(name => !!name).reduce((mapping, dependency) => {
		const name = parseName(dependency);
		addElement(mapping, name, dependencies.packages[dependency].version);
		return mapping;
	},
	/** @type {Record<string, string[]>} */
	{},
	);
}

/**
 * @param {string} lockFile The source file of installed / used dependencies
 * @returns {Record<string, string[]>}
 */
function getDependencies(lockFile) {
	const get = () => {
		switch (path.basename(lockFile)) {
			case 'yarn.lock':
				try {
					return parseYarnLockFile(lockFile);
				} catch (e) {
					return parseYarn3LockFile(lockFile);
				}

			case 'package-lock.json':
				return parsePackageLockFile(lockFile);
			default:
				throw new Error('Unsupported file');
		}
	};

	const dependencies = get();
	Object.keys(dependencies).forEach((dependency) => {
		dependencies[dependency] = semverSort.desc(dependencies[dependency]);
	});
	return dependencies;
}

const dependencies = getDependencies(LOCK_FILE);

/**
 * @returns {void}
 */
function updateDependencies() {

	/**
     * @typedef Hook
     * @property {string} id
     * @property {string[]} additional_dependencies
     *
     * @typedef Repo
     * @property {string} repo
     * @property {Hook[]} hooks
     *
     * @typedef PreCommit
     * @property {Repo[]} repos
    */

	/** @type {PreCommit} */
	const preCommit = YAML.parse(readFile(PRE_COMMIT_YAML));

	const eslintHook = preCommit.repos
		.find((obj) => obj.repo === 'https://github.com/pre-commit/mirrors-eslint')
		?.hooks.find((hook) => hook.id === 'eslint');
	if (eslintHook?.additional_dependencies) {
		const mapping = eslintHook.additional_dependencies.reduce(
			(
				/** @type {Record<string, string>} */
				mapping,
				dependency,
			) => {
				const {name} = parseVersion(dependency);
				const installedVersions = dependencies[name];
				if (!name) {
					console.warn(`${dependency} is used in in a pre-commit hook, but is not in ${LOCK_FILE}`);
				}

				mapping[dependency] = installedVersions
					? `${name}@${installedVersions[0]}`
					: dependency;
				return mapping;
			},
			/** @type {Record<string, string>} */
			{},
		);
		let content = readFile(PRE_COMMIT_YAML);
		Object.keys(mapping).forEach((previousVersion) => {
			const newVersion = mapping[previousVersion];
			content = content.replace(new RegExp(`( +- *["']?)${previousVersion}(["']? *#.*)?`, 'gi'), '$1' + newVersion + '$2');
		});
		fs.writeFileSync(PRE_COMMIT_YAML, content);
	}
}

updateDependencies();
