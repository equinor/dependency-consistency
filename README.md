# Consistent dependencies

Keeps dependencies defined in your pre-commit hooks (`additional_dependencies`) consistent with those defined in your lock file(s).

The main use-case is to keep plugins used in ESLint / prettier consistent with those in `pckage-locj.json` / `yarn.lock`.
That way, when changes are made in the main dependencies, and they are detected by your IDE / editor of choice, the pre-commit hooks will use the same versions.

`consistent-dependencies` support Node.js (`npm` or `yarn`) and Python (`poetry` and `pip` / `requirements.txt`).

## Usage

```yaml

  - repo: https://github.com/equinor/dependency-consistency
    rev: v2.1.0
    hooks:
      - id: consistent-dependencies
        args:
            - <path to lock file>
            - <another lock file> 
```
