#!/usr/bin/env bash

set -o errexit
set -o nounset
set -o pipefail

export ROOT="${GIT_ROOT:-$PWD}"

git::version::get_version_vars() {
  local projGit=(git --git-dir "${ROOT}/.git" --work-tree "${ROOT}")

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

      echo "${GIT_VERSION}"
      DASHES_IN_VERSION=$(echo "${GIT_VERSION}" | sed "s/[^-]//g")
      echo "${DASHES_IN_VERSION}"
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

      echo "${GIT_VERSION}"

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

STABLE_BUILD_GIT_COMMIT=${GIT_COMMIT-}
echo stable_build_git_commit=${STABLE_BUILD_GIT_COMMIT-}
echo stable_build_scm_status=${GIT_TREE_STATE-}
STABLE_BUILD_SCM_REVISION=${GIT_VERSION-}
echo stable_build_scm_revision=${STABLE_BUILD_SCM_REVISION-}
echo stable_build_major_version=${GIT_MAJOR-}
echo stable_build_minor_version=${GIT_MINOR-}
STABLE_DOCKER_TAG=${GIT_VERSION/+/_}
echo stable_docker_tag=${STABLE_DOCKER_TAG}
echo stable_semver_version=$(echo ${STABLE_DOCKER_TAG} | sed -e 's/-.*//')
STABLE_BUILD_DATE=$(date -u +'%y-%m-%dt%h:%m:%sz')
echo stable_build_date=${STABLE_BUILD_DATE}
echo stable_version=${STABLE_DOCKER_TAG}
echo git_commit=${STABLE_BUILD_GIT_COMMIT}
echo git_tree_state=${GIT_TREE_STATE-}
echo git_version=${STABLE_BUILD_SCM_REVISION}
echo git_major=${GIT_MAJOR-}
echo git_minor=${GIT_MINOR-}
echo build_date=${STABLE_BUILD_DATE}
#
# export stable_build_git_commit=${git_commit-}
# export stable_build_scm_status=${git_tree_state-}
# export stable_build_scm_revision=${git_version-}
# export stable_build_major_version=${git_major-}
# export stable_build_minor_version=${git_minor-}
# export stable_docker_tag=${git_version/+/_}
# export stable_semver_version=$(echo ${stable_docker_tag} | sed -e 's/-.*//')
# export stable_build_date=$(date -u +'%y-%m-%dt%h:%m:%sz')
# export stable_version=${stable_docker_tag}
# export git_commit=${stable_build_git_commit}
# export git_tree_state=${git_tree_state-}
# export git_version=${stable_build_scm_revision}
# export git_major=${git_major-}
# export git_minor=${git_minor-}
# export build_date=${stable_build_date}
