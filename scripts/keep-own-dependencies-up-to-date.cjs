#!/usr/bin/env node
const YAML = require("yaml")
const fs = require("node:fs")
const { parseVersion, readFile } = require("../shared.cjs")

const { dependencies } = require("../package-lock.json")

/**
 * @type {{additional_dependencies: string[]}[]}
 */
const hooks = YAML.parse(readFile('.pre-commit-hooks.yaml'))

hooks.forEach(hook => {
    /** @type {string[]} */
    const updatedDependencies = []
    hook.additional_dependencies.forEach(dependency => {
        const { name, version } = parseVersion(dependency)
        const reference = dependencies[name]
        if (!(reference)) {
            throw new Error(`Missing dependency '${name}' in package-lock.json`)
        }
        if (reference.version !== version) {
            updatedDependencies.push(`${name}@${reference.version}`)
        } else {
            updatedDependencies.push(dependency)
        }
    })
    hook.additional_dependencies = updatedDependencies
})

fs.writeFileSync(".pre-commit-hooks.yaml", YAML.stringify(hooks, {
    indent: 2,
}));
