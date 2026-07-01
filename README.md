# Consistent dependencies

Keeps dependencies defined in your pre-commit hooks (`additional_dependencies`) consistent with those defined in your lock file(s).

The main use-case is to keep plugins used in ESLint / prettier consistent with those in `pckage-lock.json` / `yarn.lock`.
That way, when changes are made in the main dependencies, and they are detected by your IDE / editor of choice, the pre-commit hooks will use the same versions.

`consistent-dependencies` support Node.js (`npm` or `yarn`) and Python (`uv`, `poetry` and `pip` / `requirements.txt`).

It supports both [`pre-commit`](https://pre-commit.com)'s `.pre-commit-config.yaml` and [`prek`](https://prek.j178.dev)'s `prek.toml` format.

## Usage

### `.pre-commit-config.yaml`
```yaml

  - repo: https://github.com/equinor/dependency-consistency
    rev: v3.2.0
    hooks:
      - id: consistent-dependencies
        args:
            - <path to lock file>
            - <another lock file> 
```

### `prek.toml`

```toml
[[repos]]
repo = "https://github.com/equinor/dependency-consistency"
rev = "v3.2.0"
hooks = [{id = "consistent-dependencies", args = ["<path to lock file>"]}]
```
