const fs = require('node:fs');
const path = require('node:path');
const lockfile = require('@yarnpkg/lockfile');
const YAML = require('yaml');
const semverSort = require('semver-sort');
const sqlite3 = require('sqlite3');
const {open} = require('sqlite');

const {readFile, parseVersion} = require('./shared.cjs');

if (process.argv.length < 3) {
	throw new Error('Lock file as argument is required');
}

const PRE_COMMIT_YAML = '.pre-commit-config.yaml';
const LOCK_FILE = process.argv[2];

/** @typedef {'node'} SupportedLanguages */
const SUPPORTED_LANGUAGES = /** @type {const} */ (['node']);


/** @type {Awaited<ReturnType<open>> | null} */
let db = null;

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

		const parts = dependency.split('@');
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
 * @typedef Hook
 * @property {string} id
 * @property {string[]} [additional_dependencies]
 * @property {SupportedLanguages} [language]
 *
 * @typedef Repo
 * @property {string} repo
 * @property {string} rev
 * @property {Hook[]} hooks
 *
 * @typedef PreCommit
 * @property {Repo[]} repos
 */

/**
 *  @param {Repo} repo The repository for these hooks
 *  @param {Hook} hook The specific hook we are evaluating
 *  @returns {Promise<SupportedLanguages | null>}
 *  */
async function getHookLanguage(repo, hook) {
	// TODO: Check if local
	if (repo.repo === 'local') {
		return hook.language ?? null;
	} else if (hook.language) {
		return hook.language;
	}

	if (db === null) {
		db = await open({
			filename: process.env.HOME + '/.cache/pre-commit/db.db',
			driver: sqlite3.Database,
		});
	}

	const longReference = hook.additional_dependencies ? repo.repo + ':' + hook.additional_dependencies.join(',') : repo.repo;
	const paths = await db.all('select path from repos where repo = ? and ref = ?;', longReference, repo.rev);
	if (paths.length > 0) {
		/** @type {{path: string | undefined}} */
		const {path} = paths[0];
		if (!path) {
			console.warn(`${repo.repo} (hook: ${hook.id}) is not installed in pre-commit`);
			return null;
		}

		/** @type {{id: string, language: SupportedLanguages}[]} */
		const preCommitConfiguration = YAML.parse(readFile(path + '/.pre-commit-hooks.yaml'));
		const {language} = preCommitConfiguration.find(({id}) => id === hook.id) ?? {
			language: null,
		};
		return language;
	}

	return null;
}

/**
 * @returns {Promise<void>}
 */
async function updateDependencies() {
	/** @type {PreCommit} */
	const preCommit = YAML.parse(readFile(PRE_COMMIT_YAML));

	preCommit.repos.forEach(repo => {
		repo.hooks.forEach(async hook => {
			const hookLanguage = await getHookLanguage(repo, hook);
			if (hookLanguage === null || !SUPPORTED_LANGUAGES.includes(hookLanguage)) return;

			if (hook?.additional_dependencies) {
				const mapping = hook.additional_dependencies.reduce(
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
		});
	});
}

(async () => {
	await updateDependencies();
})();
