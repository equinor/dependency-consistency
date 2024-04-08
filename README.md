# Consistent dependencies

Helps keep the dependencies defined in your pre-commit hooks for eslint consistent with those defined in your (npm / yarn) lock file.

## Usage

```yaml

  - repo: https://github.com/equinor/dependency-consistency
    rev: v2.0.0
    hooks:
      - id: consistent-dependencies
        args:
            - <path to lock file>
```
