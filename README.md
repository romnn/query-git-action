## query git action

GitHub action to query the state of your git repo.

**Note:** Requires `git` and to be installed on the runner.

#### Usage

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    - name: query git repo
      id: query
      uses: romnn/query-git-action@main

    - name: show output variables
      run: |
        echo "${{ steps.query.outputs.git_commit }}"
        echo "${{ steps.query.outputs.scm_status }}"
        echo "${{ steps.query.outputs.tree_state }}"
        echo "${{ steps.query.outputs.scm_revision }}"
        echo "${{ steps.query.outputs.major_version }}"
        echo "${{ steps.query.outputs.minor_version }}"
        echo "${{ steps.query.outputs.docker_tag }}"
        echo "${{ steps.query.outputs.semver_version }}"
        echo "${{ steps.query.outputs.build_date }}"
```

#### Development

```bash
# find a tagged commit
git show-ref --tags

# use that commit during development
GIT_COMMIT=<TAGGED_COMMIT> yarn run run
```
