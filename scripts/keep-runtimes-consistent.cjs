#!/usr/bin/env node
// @ts-check

const {readFile, updateYamlFile} = require('../shared.cjs');

/** @import {PreCommit, Hook, ChangeYaml} from '../types' */

function main() {
	const reference = readFile('.tool-versions');
	const nodeVersion = /nodejs +(\d+\.\d+\.\d+)/.exec(reference)?.[1];
	if (!nodeVersion) {
		throw new Error('Could not find the version of Node.js in .tool-versions');
	}

	updateYamlFile(
		'.pre-commit-config.yaml',
		/** @type {ChangeYaml<PreCommit>} */ preCommit => {
			preCommit.repos.forEach(repo => {
				repo.hooks.forEach(hook => {
					if (hook.language === 'node') {
						hook.language_version = nodeVersion;
					}
				});
			});
		},
	);

	updateYamlFile(
		'.pre-commit-hooks.yaml',
		/** @type {ChangeYaml<Hook[]>} */ hooks => {
			hooks.forEach(hook => {
				if (hook.language === 'node') {
					hook.language_version = nodeVersion;
				}
			});
		},
	);
}

main();
