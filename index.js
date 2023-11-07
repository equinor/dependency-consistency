"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const lockfile = __importStar(require("@yarnpkg/lockfile"));
const YAML = __importStar(require("yaml"));
const semverSort = __importStar(require("semver-sort"));
if (process.argv.length < 3) {
    throw new Error("Lock file as argument is required");
}
const PRE_COMMIT_YAML = ".pre-commit-config.yaml";
const LOCK_FILE = process.argv[2];
const readFile = (path) => fs.readFileSync(path, "utf8");
const parseVersion = (dependency) => {
    const { name, version } = /^(?<name>@?[a-z-/0-9]+)(@(?<version>\d+\.\d+\.\d+))?$/.exec(dependency)?.groups || { name: "", version: null };
    return {
        name,
        version: version || null,
    };
    // console.log({name, version});
    const parts = dependency.split("@");
    const lastIndex = parts.length - 1;
    return {
        name: parts.slice(0, lastIndex).join("@"),
        version: parts[lastIndex],
    };
};
function parseYarnLockFile(file) {
    const dependencies = lockfile.parse(readFile(file));
    return Object.keys(dependencies.object).reduce((mapping, dependency) => {
        const { name } = parseVersion(dependency);
        const installedVersion = dependencies.object[dependency].version;
        if (!mapping[name])
            mapping[name] = [];
        mapping[name].push(installedVersion);
        return mapping;
    }, {});
}
function parseYarn3LockFile(file) {
    const dependencies = YAML.parse(readFile(file));
    if (![6, 8].includes(dependencies.__metadata.version)) {
        throw new Error("Unsupported format");
    }
    delete dependencies.__metadata;
    return Object.keys(dependencies).reduce((mapping, dependency) => {
        const parts = dependency.split("@");
        const name = !parts[0] ? "@" + parts[1] : parts[0];
        const installedVersion = dependencies[dependency].version;
        if (!mapping[name])
            mapping[name] = [];
        mapping[name].push(installedVersion);
        return mapping;
    }, {});
}
function parsePackageLockFile(file) {
    const dependencies = JSON.parse(readFile(file));
    if (![2, 3].includes(dependencies.lockfileVersion))
        throw new Error(`Unsupported version of package-lock.json (${dependencies.lockfileVersion})`);
    function parseName(dependency) {
        let [name, namespace, ...prefix] = dependency.split("/").reverse();
        if (namespace.startsWith("@")) {
            name = namespace + "/" + name;
        }
        return name;
    }
    return Object.keys(dependencies.packages).filter(name => !!name).reduce((mapping, dependency) => {
        const name = parseName(dependency);
        if (!(name in mapping))
            mapping[name] = [];
        mapping[name].push(dependencies.packages[dependency].version);
        return mapping;
    }, {});
}
function getDependencies() {
    const get = () => {
        switch (path.basename(LOCK_FILE)) {
            case "yarn.lock":
                try {
                    return parseYarnLockFile(LOCK_FILE);
                }
                catch (e) {
                    return parseYarn3LockFile(LOCK_FILE);
                }
            case "package-lock.json":
                return parsePackageLockFile(LOCK_FILE);
            default:
                throw new Error("Unsupported file");
        }
    };
    const dependencies = get();
    Object.keys(dependencies).forEach((dependency) => {
        dependencies[dependency] = semverSort.desc(dependencies[dependency]);
    });
    return dependencies;
}
const dependencies = getDependencies();
function updateDependencies() {
    const preCommit = YAML.parse(readFile(PRE_COMMIT_YAML));
    const eslintHook = preCommit.repos
        .find((obj) => obj.repo === "https://github.com/pre-commit/mirrors-eslint")
        ?.hooks.find((hook) => hook.id === "eslint");
    if (eslintHook?.additional_dependencies) {
        const mapping = eslintHook.additional_dependencies.reduce((mapping, dependency) => {
            const { name } = parseVersion(dependency);
            const installedVersions = dependencies[name];
            if (!name) {
                console.warn(`${dependency} is used in in a pre-commit hook, but is not in ${LOCK_FILE}`);
            }
            mapping[dependency] = installedVersions
                ? `${name}@${installedVersions[0]}`
                : dependency;
            return mapping;
        }, {});
        let content = readFile(PRE_COMMIT_YAML);
        Object.keys(mapping).forEach((previousVersion) => {
            const newVersion = mapping[previousVersion];
            content = content.replace(new RegExp(`\n( +- *"?)${previousVersion}("? *#.*)?\n`, "gi"), "\n$1" + newVersion + "$2\n");
        });
        fs.writeFileSync(PRE_COMMIT_YAML, content);
    }
}
updateDependencies();
