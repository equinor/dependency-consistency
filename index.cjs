#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const lockfile = require('@yarnpkg/lockfile');
const YAML = require('yaml');
const toml = require('toml');
const requirements = require('pip-requirements-js');
const semverSort = require('semver-sort');
const sqlite3 = require('sqlite3');
const {open} = require('sqlite');

const {readFile, parseVersion, escapeRegex} = require('./shared.cjs');

if (process.argv.length < 3) {
	throw new Error('At least one lock file must be given');
}

const PRE_COMMIT_YAML = '.pre-commit-config.yaml';
const LOCK_FILES = process.argv.slice(2);

/** @typedef {'node' | 'python'} SupportedLanguages */
const SUPPORTED_LANGUAGES = /** @type {const} */ (['node', 'python']);

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
	if (!(key in mapping)) {
		mapping[key] = [];
	}

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

	// Delete dependencies.__metadata;
	return Object.keys(dependencies).reduce(
		(mapping, dependency) => {
			if (dependency === '__metadata') {
				return mapping;
			}

			const parts = dependency.split('@');
			const name = parts[0] ? parts[0] : '@' + parts[1];
			const installedVersion = dependencies[dependency].version;
			addElement(mapping, name, installedVersion);
			return mapping;
		},
		/** @type {Record<string, string[]>} */
		{},
	);
}

/**
 * @param {string} lockFile
 * @returns {Record<string, string[]>}
 * */
function parsePoetryLockFile(lockFile) {
	/**
	 * @typedef Package
	 * @property {string} name
	 * @property {string} version
	 * @property {Record<string, string[]> | undefined} extras
	 *
	 * @typedef PoetryLock
	 * @property {Package[]} package
	 * */

	/** @type {PoetryLock} */
	const dependencies = toml.parse(readFile(lockFile));
	return dependencies.package.reduce(
		(dependencies, {name, version, extras}) =>
			({
				...dependencies,
				[name]: [version],
				...(extras
					? Object.keys(extras).reduce(
						(dependencies, extra) => ({
							...dependencies,
							[`${name}[${extra}]`]: [version],
						})
						, {},
					)
					: {}),
			}),
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
	if (![2, 3].includes(dependencies.lockfileVersion)) {
		throw new Error(`Unsupported version of package-lock.json (${dependencies.lockfileVersion})`);
	}

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

	return Object.keys(dependencies.packages).filter(name => Boolean(name)).reduce(
		(mapping, dependency) => {
			const name = parseName(dependency);
			addElement(mapping, name, dependencies.packages[dependency].version);
			return mapping;
		},
		/** @type {Record<string, string[]>} */
		{},
	);
}

/**
 * @param {string} lockFile
 * @returns {Record<string, string[]>}
 * */
function parseRequirementsFile(lockFile) {
	const content = readFile(lockFile);

	/** @type {Record<string, string[]>} */
	const dependencies = {};
	requirements.parsePipRequirementsFile(content
		.replace(/\\\n/gs, ' ')
		.replace(/--hash=[a-z0-9]+:[0-9a-f]+/g, '')
		.replace(/ +/g, ' ')
		.replace(/\n+/g, '\n')
		.replace(/;.*$/gm, ''))
		.forEach(requirement => {
			if ('name' in requirement) {
				if ('versionSpec' in requirement && requirement.versionSpec) {
					dependencies[requirement.name.toLowerCase()] = requirement.versionSpec.map(spec => spec.version);
				} else {
					dependencies[requirement.name.toLowerCase()] = [];
				}
			}
		});
	return dependencies;
}

/**
 * @param {string[]} lockFiles The source file of installed / used dependencies
 * @returns {Partial<Record<SupportedLanguages, Record<string, string[]>>>}
 */
function getDependencies(lockFiles) {
	/** @type {(lockFile: string) => [SupportedLanguages, Record<string, string[]>]} */
	const get = lockFile => {
		switch (path.basename(lockFile)) {
			case 'yarn.lock':
				try {
					return ['node', parseYarnLockFile(lockFile)];
				} catch {
					return ['node', parseYarn3LockFile(lockFile)];
				}

			case 'package-lock.json':
				return ['node', parsePackageLockFile(lockFile)];
			case 'poetry.lock':
				return ['python', parsePoetryLockFile(lockFile)];
			default:
			{
				const fileName = path.basename(lockFile);
				if (/requirements(\.[a-z0-9]+)?\.txt/i.test(fileName)) {
					return ['python', parseRequirementsFile(lockFile)];
				}

				throw new Error('Unsupported file');}
		}
	};

	const dependencies = lockFiles.reduce(
		(dependencies, file) => {
			const [language, installedVersions] = get(file);
			if (language in dependencies) {
				throw new Error('Multiple lock files of the same language are not supported yet');
			}

			/** @type {Record<string, string[]>} */(dependencies[/** @type {keyof dependencies} */ (language)]) = installedVersions;
			return dependencies;
		},
		/** @type {Partial<Record<SupportedLanguages, Record<string, string[]>>>} */
		{},
	);
	Object.keys(dependencies).forEach(language => {
		Object.keys(dependencies[/** @type {keyof dependencies} */(language)]).forEach(dependency => {
			/** @type {Record<string, string[]>} */
			(dependencies[/** @type {keyof dependencies} */ (language)])[dependency] = semverSort.desc(dependencies[/** @type {keyof dependencies} */ (language)][dependency]);
		});
	});
	return dependencies;
}

const dependencies = getDependencies(LOCK_FILES);

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
	if (repo.repo === 'local') {
		return hook.language ?? null;
	}

	if (hook.language) {
		return hook.language;
	}

	db ??= await open({
		filename: process.env.HOME + '/.cache/pre-commit/db.db',
		driver: sqlite3.Database,
	});

	const longReference = hook.additional_dependencies ? repo.repo + ':' + hook.additional_dependencies.join(',') : repo.repo;
	const paths = await db.all('select path from repos where (repo = ? or repo = ?) and ref = ? order by repo desc;', longReference, repo.repo, repo.rev);
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
 * @param {string} name The name of the dependency
 * @param {string} version Which version of the dependency should be pinned
 * @param {SupportedLanguages} language Which runtime / runtime is this dependency for?
 *
 * @returns {string}
 * */
function pinVersionInDependency(name, version, language) {
	switch (language) {
		case 'node':
			return `${name}@${version}`;
		case 'python':
			return `${name}==${version}`;
	}
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
			if (hookLanguage === null || !SUPPORTED_LANGUAGES.includes(hookLanguage)) {
				return;
			}

			if (!(hookLanguage in dependencies)) {
				return;
			}

			if (hook?.additional_dependencies) {
				const mapping = hook.additional_dependencies.reduce(
					(
						/** @type {Record<string, string>} */
						mapping,
						dependency,
					) => {
						const {name} = parseVersion(dependency);
						const installedVersions = /** @type {string[]} */(/** @type {Record<string, string[]>} */ (dependencies[hookLanguage])[name.toLowerCase()]);
						if (!name) {
							console.warn(`${dependency} is used in in a pre-commit hook, but is not in any of the provided lock files`);
						}

						mapping[dependency] = installedVersions
							? pinVersionInDependency(name, installedVersions[0], hookLanguage)
							: dependency;
						return mapping;
					},
					/** @type {Record<string, string>} */
					{},
				);
				let content = readFile(PRE_COMMIT_YAML);
				Object.keys(mapping).forEach(previousVersion => {
					const newVersion = mapping[previousVersion];
					content = content.replace(new RegExp(`( +- *["']?)${escapeRegex(previousVersion)}(["']? *#.*)?`, 'gi'), '$1' + newVersion + '$2');
				});
				fs.writeFileSync(PRE_COMMIT_YAML, content);
			}
		});
	});
}

(async () => {
	await updateDependencies();
})();
