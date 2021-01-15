#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

export ROOT="${GITHUB_WORKSPACE}"

git::version::get_version_vars() {
  local projGit=(git --work-tree "${ROOT}")

  if [[ -n ${GIT_COMMIT-} ]] || GIT_COMMIT=$("${projGit[@]}" rev-parse "HEAD^{commit}" 2> /dev/null); then
    if [[ -z ${GIT_TREE_STATE-} ]]; then
      # Check if the tree is dirty.  default to dirty
      if git_status=$("${projGit[@]}" status --porcelain 2> /dev/null) && [[ -z ${git_status} ]]; then
        GIT_TREE_STATE="clean"
      else
        GIT_TREE_STATE="dirty"
      fi
    fi

    # Use git describe to find the version based on tags.
    if [[ -n ${GIT_VERSION-} ]] || GIT_VERSION=$("${projGit[@]}" describe --tags --match='v*' --abbrev=14 "${GIT_COMMIT}^{commit}" 2> /dev/null); then
      # This translates the "git describe" to an actual semver.org
      # compatible semantic version that looks something like this:
      #   v1.1.0-alpha.0.6+84c76d1142ea4d
      #

      DASHES_IN_VERSION=$(echo "${GIT_VERSION}" | sed "s/[^-]//g")
      if [[ "${DASHES_IN_VERSION}" == "---" ]]; then
        # shellcheck disable=SC2001
        # We have distance to subversion (v1.1.0-subversion-1-gCommitHash)
        GIT_VERSION=$(echo "${GIT_VERSION}" | sed "s/-\([0-9]\{1,\}\)-g\([0-9a-f]\{14\}\)$/.\1\+\2/")
      elif [[ "${DASHES_IN_VERSION}" == "--" ]]; then
        # shellcheck disable=SC2001
        # We have distance to base tag (v1.1.0-1-gCommitHash)
        GIT_VERSION=$(echo "${GIT_VERSION}" | sed "s/-g\([0-9a-f]\{14\}\)$/+\1/")
      fi
      if [[ "${GIT_TREE_STATE}" == "dirty" ]]; then
        # git describe --dirty only considers changes to existing files, but
        # that is problematic since new untracked .go files affect the build,
        # so use our idea of "dirty" from git status instead.
        GIT_VERSION+="-dirty"
      fi

      # Try to match the "git describe" output to a regex to try to extract
      # the "major" and "minor" versions and whether this is the exact tagged
      # version or whether the tree is between two tagged versions.
      if [[ "${GIT_VERSION}" =~ ^v([0-9]+)\.([0-9]+)(\.[0-9]+)?([-].*)?([+].*)?$ ]]; then
        GIT_MAJOR=${BASH_REMATCH[1]}
        GIT_MINOR=${BASH_REMATCH[2]}
        if [[ -n "${BASH_REMATCH[4]}" ]]; then
          GIT_MINOR+="+"
        fi
      fi

      # If GIT_VERSION is not a valid Semantic Version, then refuse to build.
      if ! [[ "${GIT_VERSION}" =~ ^v([0-9]+)\.([0-9]+)(\.[0-9]+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
        echo "GIT_VERSION should be a valid Semantic Version. Current value: ${GIT_VERSION}"
        echo "Please see more details here: https://semver.org"
        exit 1
      fi
    fi
  fi
}

git::version::get_version_vars

export STABLE_BUILD_GIT_COMMIT=${GIT_COMMIT-}
export STABLE_BUILD_SCM_STATUS=${GIT_TREE_STATE-}
export STABLE_BUILD_SCM_REVISION=${GIT_VERSION-}
export STABLE_BUILD_MAJOR_VERSION=${GIT_MAJOR-}
export STABLE_BUILD_MINOR_VERSION=${GIT_MINOR-}
export STABLE_DOCKER_TAG=${GIT_VERSION/+/_}
export STABLE_SEMVER_VERSION=$(echo ${STABLE_DOCKER_TAG} | sed -e 's/-.*//')
export STABLE_BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
export STABLE_VERSION=${STABLE_DOCKER_TAG}
export GIT_COMMIT=${STABLE_BUILD_GIT_COMMIT}
export GIT_TREE_STATE=${GIT_TREE_STATE-}
export GIT_VERSION=${STABLE_BUILD_SCM_REVISION}
export GIT_MAJOR=${GIT_MAJOR-}
export GIT_MINOR=${GIT_MINOR-}
export BUILD_DATE=${STABLE_BUILD_DATE}
