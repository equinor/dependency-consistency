#!/usr/bin/env node
// @ts-check

const {parseVersion, updateYamlFile} = require('../shared.cjs');

/** @import {ChangeYaml, Hook} from '../types' */

/**
 * @typedef Dependency
 * @property {string} version
 * @property {string} resolved
 * @property {string} integrity
 * @property {boolean} [dev]
 * @property {any} [requires]
 * */

/**
 * Helper function to extract dependencies from version 3 of package-lock.json
 * @return {Record<string, Dependency>}
 */
function getDependencies() {
	const {packages} = require('../package-lock.json');

	return Object.keys(packages).reduce(
		(dependencies, key) => {
			if (key === '""') {
				return dependencies;
			}

			if (!key.startsWith('node_modules/')) {
				return dependencies;
			}

			const name = key.replace(/^node_modules\//, '');

			return {
				...dependencies,
				[name]: packages[/** @type {keyof packages} */ (key)],
			};
		},
		/** @type {Record<string, Dependency>} */
		{},
	);
}

const dependencies = getDependencies();

/** @type {Record<string, string>} */
const declaredDependencies = require('../package.json').dependencies;

updateYamlFile(
	'.pre-commit-hooks.yaml',
	/** @type {ChangeYaml<Hook[]> }*/ hooks => {
		hooks.forEach(hook => {
			/** @type {string[]} */
			const updatedDependencies = [];
			/** @type {string[]} */
			let missingDependencies = Object.keys(declaredDependencies);
			hook.additional_dependencies.forEach(dependency => {
				const {name, version} = parseVersion(dependency);
				missingDependencies = missingDependencies.filter(
					dependency => dependency !== name,
				);

				/** @type {Dependency | undefined} */
				const reference = dependencies[name];
				if (!reference) {
					throw new Error(`Missing dependency '${name}' in package-lock.json`);
				}

				if (reference.version === version) {
					updatedDependencies.push(dependency);
				} else {
					updatedDependencies.push(`${name}@${reference.version}`);
				}
			});
			missingDependencies.forEach(dependency => {
				const {version} = dependencies[dependency] ?? {version: null};
				if (!version) {
					throw new Error(
						`${dependency} is defined in package.json, but not in package-lock.json`,
					);
				}

				updatedDependencies.push(`${dependency}@${version}`);
			});
			hook.additional_dependencies = updatedDependencies.sort();
		});
	},
);
