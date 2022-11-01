import fs from "fs"
import path from "path"
import * as lockfile from "@yarnpkg/lockfile"
import YAML from "yaml"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import semverSort from "semver-sort"

interface Dependency {
  name: string
  version: string
}

if (process.argv.length < 3) {
    throw new Error("Lock file as argument is required")
}

const PRE_COMMIT_YAML = ".pre-commit-config.yaml"
const LOCK_FILE = process.argv[2]
console.log(LOCK_FILE)

const readFile = (path: string): string => fs.readFileSync(path, "utf8")

const parseVersion = (dependency: string): Dependency => {
  const parts = dependency.split("@")
  const lastIndex = parts.length - 1
  return {
    name: parts.slice(0, lastIndex).join("@"),
    version: parts[lastIndex],
  }
}

function parseYarnLockFile (file: string): Record<string, string[]> {
    const dependencies = lockfile.parse(readFile(file))
    return Object.keys(dependencies.object).reduce((mapping, dependency) => {
      const { name } = parseVersion(dependency)
      const installedVersion = dependencies.object[dependency].version
      if (!mapping[name]) mapping[name] = []
      mapping[name].push(installedVersion)
      return mapping
    }, {} as Record<string, string[]>)
}

function parsePackageLockFile(file: string): Record<string, string[]> {
    const dependencies = JSON.parse(readFile(file))
    if (dependencies.lockfileVersion !== 2) throw new Error(`Unsupported version of package-lock.json (${dependencies.lockfileVersion})`)

    function parseName(dependency: string): string {
        let [name, namespace, ...prefix] = dependency.split("/").reverse()
        if (namespace.startsWith("@")) {
            name = namespace + "/" + name
        }
        return name
    }

    return Object.keys(dependencies.packages).filter(name => !!name).reduce((mapping, dependency) => {
        const name = parseName(dependency)
        if (!(name in mapping)) mapping[name] = []
        mapping[name].push(dependencies.packages[dependency].version)
        return mapping
    }, ({} as Record<string, string[]>))
}

function getDependencies(): Record<string, string[]> {
  const get = () => {
      switch (path.basename(LOCK_FILE)) {
          case "yarn.lock":
              return parseYarnLockFile(LOCK_FILE)
          case "package-lock.json":
              return parsePackageLockFile(LOCK_FILE)
          default:
              throw new Error("Unsupported file")
      }
  }
  const dependencies = get()
    Object.keys(dependencies).forEach((dependency) => {
    dependencies[dependency] = semverSort.desc(dependencies[dependency])
  })
  return dependencies
}

const dependencies = getDependencies()

function updateDependencies(): void {
  const preCommit = YAML.parse(readFile(PRE_COMMIT_YAML))

  interface Hook {
    id: string
    additional_dependencies: string[]
  }

  interface Repo {
    repo: string
    hooks: Hook[]
  }

  interface PreCommit {
    repos: Repo[]
  }

  const eslintHook = (preCommit as PreCommit).repos
    .find((obj) => obj.repo === "https://github.com/pre-commit/mirrors-eslint")
    ?.hooks.find((hook) => hook.id === "eslint")
  if (eslintHook?.additional_dependencies) {
    const mapping = eslintHook.additional_dependencies.reduce(
      (mapping, dependency) => {
        const { name } = parseVersion(dependency)
        const installedVersions = dependencies[name]
        mapping[dependency] = installedVersions
          ? `${name}@${installedVersions[0]}`
          : dependency
        return mapping
      },
      {} as Record<string, string>
    )
    let content = readFile(PRE_COMMIT_YAML)
    Object.keys(mapping).forEach((previousVersion) => {
      const newVersion = mapping[previousVersion]
      content = content.replace(previousVersion, newVersion)
    })
    fs.writeFileSync(PRE_COMMIT_YAML, content)
  }
}

updateDependencies()
