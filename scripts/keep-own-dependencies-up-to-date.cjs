#!/usr/bin/env node
// @ts-check

/** @constant */
const YAML = require('yaml');
const fs = require('node:fs');
const {parseVersion, readFile} = require('../shared.cjs');

/**
 * @typedef Dependency
 * @property {string} version
 * @property {string} resolved
 * @property {string} integrity
 * @property {boolean} [dev]
 * @property {any} [requires]
 * */

/** @type {Record<string, Dependency> } */
const dependencies = require('../package-lock.json').dependencies;

/** @type {Record<string, string>} */
const declaredDependencies = require('../package.json').dependencies;

/**
 * @type {{additional_dependencies: string[]}[]}
 */
const hooks = YAML.parse(readFile('.pre-commit-hooks.yaml'));

hooks.forEach(hook => {
	/** @type {string[]} */
	const updatedDependencies = [];
	/** @type {string[]} */
	let missingDependencies = Object.keys(declaredDependencies);
	hook.additional_dependencies.forEach(dependency => {
		const {name, version} = parseVersion(dependency);
		missingDependencies = missingDependencies.filter(dependency => dependency !== name);

		/** @type {Dependency | undefined} */
		const reference = dependencies[name];
		if (!(reference)) {
			throw new Error(`Missing dependency '${name}' in package-lock.json`);
		}

		if (reference.version !== version) {
			updatedDependencies.push(`${name}@${reference.version}`);
		} else {
			updatedDependencies.push(dependency);
		}
	});
	missingDependencies.forEach(dependency => {
		const {version} = dependencies[dependency] ?? {version : null};
		if (!version) {
			throw new Error(`${dependency} is defined in package.json, but not in package-lock.json`);
		}

		updatedDependencies.push(`${dependency}@${version}`);
	});
	hook.additional_dependencies = updatedDependencies.sort();
});

fs.writeFileSync('.pre-commit-hooks.yaml', YAML.stringify(hooks, {
	indent: 2,
}));
