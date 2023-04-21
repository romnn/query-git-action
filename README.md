## query git action

GitHub action to query the state of your git repo.

**Note:** Requires `git` and `curl` to be installed on the runner.

#### Usage

```yaml
# .github/workflows/ci.yml
name: CI
on: ['push']

jobs:
  build:
    runs-on: 'ubuntu-latest'
    steps:
    - uses: actions/checkout@v3

    - name: query git repo
      id: query
      uses: romnn/query-git-action@main

    - name: show output variables
      run: |
        echo '${{ steps.query.outputs.stable_build_git_commit }}'
        echo '${{ steps.query.outputs.stable_build_scm_status }}'
        echo '${{ steps.query.outputs.stable_build_scm_revision }}'
        echo '${{ steps.query.outputs.stable_build_major_version }}'
        echo '${{ steps.query.outputs.stable_build_minor_version }}'
        echo '${{ steps.query.outputs.stable_docker_tag }}'
        echo '${{ steps.query.outputs.stable_semver_version }}'
        echo '${{ steps.query.outputs.stable_build_date }}'
        echo '${{ steps.query.outputs.stable_version }}'
        echo '${{ steps.query.outputs.git_commit }}'
        echo '${{ steps.query.outputs.git_tree_state }}'
        echo '${{ steps.query.outputs.git_version }}'
        echo '${{ steps.query.outputs.git_major }}'
        echo '${{ steps.query.outputs.git_minor }}'
        echo '${{ steps.query.outputs.build_date }}'
```

#### Development

```bash
# find a tagged commit
git show-ref --tags

# use that commit during development
GIT_COMMIT=<TAGGED_COMMIT> yarn run run
```
