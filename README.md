## query git action

GitHub action to query the state of your git repo.

#### Usage

```yaml
# .github/workflows/ci.yml
name: CI
on: ['push']

jobs:
  build:
    runs-on: 'ubuntu-latest'
    steps:
    - uses: actions/checkout@v2

    - name: 'query git repo'
      id: query
      uses: 'romnnn/query-git-action@master'

    - name: 'use the action's output variables'
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
