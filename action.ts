import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { ExecOutput, ExecOptions } from "@actions/exec";
import * as path from "path";
import { exec as execChildProcess } from 'node:child_process';
// var exec = require('child_process').execFile;

// async function getVersion(): Promise<string> {
//   let version = "latest";
//   const manifest = await parseCargoPackageManifestAsync(
//     path.join(__dirname, "../Cargo.toml")
//   );
//   let manifestVersion = manifest.package?.version;
//   if (manifestVersion && manifestVersion !== "") {
//     version = `v${manifestVersion}`;
//   }
//   let versionOverride = core.getInput("version");
//   if (versionOverride && versionOverride !== "") {
//     version = versionOverride;
//   }
//   return version;
// }

function getInput(name: string): string | undefined {
  const value = core.getInput(name);
  if (value && value !== "") return value;
  return undefined;
}

async function gitCommand(
  repo: string,
  args: string[],
  options: ExecOptions
): Promise<ExecOutput> {
  const cmd = [
    "--git-dir",
    path.join(repo, ".git"),
    "--work-tree",
    repo,
    ...args,
  ];
  const output = await exec.getExecOutput("git", cmd, {
    cwd: repo,
    ...options,
    ignoreReturnCode: true,
  });
  if (output.exitCode != 0) {
    if (options.ignoreReturnCode ?? false) {
      core.debug(output.stdout.trim());
      core.debug(output.stderr.trim());
    } else {
      core.info(output.stdout.trim());
      core.error(output.stderr.trim());
      throw new Error(
        `command "git ${cmd.join(' ')}" failed with exit code ${output.exitCode}`
      );
    }
  }
  return output;
}

async function unshallowRepo(repo: string): Promise<void> {
  core.info(`unshallow git repository at ${repo}`);
  const { exitCode, stdout, stderr } = await gitCommand(
    repo,
    ["fetch", "--prune", "--unshallow"],
    { ignoreReturnCode: true, silent: true }
  );
  if (exitCode != 0) {
    if (stderr.includes("on a complete repository does not make sense")) {
      // ignore
    } else {
      core.info(stdout.trim());
      core.error(stderr.trim());
      throw new Error(`failed to unshallow repository (exit code ${exitCode})`);
    }
  }
}

function execNative(command: string): Promise<{ error?: string, stdout: string, stderr: string }> {
  return new Promise(function(resolve, reject) {
    execChildProcess(command, (error, stdout, stderr) => {

      stdout = stdout.trim();
      stderr = stderr.trim();
      if (error) {
        reject({ error, stdout, stderr });
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function run(): Promise<void> {
  const workspace = process.env["GITHUB_WORKSPACE"];
  const repo = getInput("repo") ?? workspace ?? process.cwd();
  if (!repo) {
    throw new Error("missing repo root: set the `repo` input variable.");
  }

  await unshallowRepo(repo);

  const gitCommit = process.env["GIT_COMMIT"] ??
    (await gitCommand(repo, ["rev-parse", "HEAD^{commit}"], { silent: true })
    ).stdout.trim();
  console.log(gitCommit);

  // check if the tree is dirty (default to dirty)
  const gitStatus = (
    await gitCommand(repo, ["status", "--porcelain"], { silent: true })
  ).stdout.trim();
  console.log(gitStatus);
  const gitTreeState = process.env["GIT_TREE_STATE"] ?? gitStatus === "" ? "clean" : "dirty";
  console.log(gitTreeState);

  // use git describe to find the version based on tags.
  const gitVersion = (
    await execNative(
      [
        "git",
        "--git-dir",
        path.join(repo, ".git"),
        "--work-tree",
        repo,
        "describe",
        "--tags",
        // "--always",
        "--match='v*'",
        // "--abbrev=14",
        // gitCommit,
        // `${gitCommit}^{commit}`,
      ].join(" "),
    )
  ).stdout;
  console.log(gitVersion);

  const gitVersion2 = (
    await gitCommand(
      repo,
      [
        "describe",
        "--tags",
        // "--always",
        "--match='v*'",
        // "--abbrev=14",
        // gitCommit,
        // `${gitCommit}^{commit}`,
      ],
      { silent: false }
    )
  ).stdout;
  console.log(gitVersion2);

  // This translates the "git describe" to an actual semver.org
  // compatible semantic version that looks something like this:
  //    v1.1.0-alpha.0.6+84c76d1142ea4d

  // DASHES_IN_VERSION=$(echo "${GIT_VERSION}" | sed "s/[^-]//g")

  //   DASHES_IN_VERSION=$(echo "${GIT_VERSION}" | sed "s/[^-]//g")
  //   if [[ "${DASHES_IN_VERSION}" == "---" ]]; then
  //     # shellcheck disable=SC2001
  //     # We have distance to subversion (v1.1.0-subversion-1-gCommitHash)
  //     GIT_VERSION=$(echo "${GIT_VERSION}" | sed "s/-\([0-9]\{1,\}\)-g\([0-9a-f]\{14\}\)$/.\1\+\2/")
  //   elif [[ "${DASHES_IN_VERSION}" == "--" ]]; then
  //     # shellcheck disable=SC2001
  //     # We have distance to base tag (v1.1.0-1-gCommitHash)
  //     GIT_VERSION=$(echo "${GIT_VERSION}" | sed "s/-g\([0-9a-f]\{14\}\)$/+\1/")
  //   fi
  //   if [[ "${GIT_TREE_STATE}" == "dirty" ]]; then
  //     # git describe --dirty only considers changes to existing files, but
  //     # that is problematic since new untracked .go files affect the build,
  //     # so use our idea of "dirty" from git status instead.
  //     GIT_VERSION+="-dirty"
  //   fi
  //
  //   # Try to match the "git describe" output to a regex to try to extract
  //   # the "major" and "minor" versions and whether this is the exact tagged
  //   # version or whether the tree is between two tagged versions.
  //   if [[ "${GIT_VERSION}" =~ ^v([0-9]+)\.([0-9]+)(\.[0-9]+)?([-].*)?([+].*)?$ ]]; then
  //     GIT_MAJOR=${BASH_REMATCH[1]}
  //     GIT_MINOR=${BASH_REMATCH[2]}
  //     if [[ -n "${BASH_REMATCH[4]}" ]]; then
  //       GIT_MINOR+="+"
  //     fi
  //   fi
  //
  //   # If GIT_VERSION is not a valid Semantic Version, then refuse to build.
  //   if ! [[ "${GIT_VERSION}" =~ ^v([0-9]+)\.([0-9]+)(\.[0-9]+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
  //     echo "GIT_VERSION should be a valid Semantic Version. Current value: ${GIT_VERSION}"
  //     echo "Please see more details here: https://semver.org"
  //     exit 1
  //   fi
  // fi

  // GIT_COMMIT=$("${projGit[@]}" rev-parse "HEAD^{commit}" 2> /dev/null)
  //
  // echo "::set-output name=STABLE_BUILD_GIT_COMMIT::${STABLE_BUILD_GIT_COMMIT}"
  // echo "::set-output name=STABLE_BUILD_SCM_STATUS::${STABLE_BUILD_SCM_STATUS}"
  // echo "::set-output name=STABLE_BUILD_SCM_REVISION::${STABLE_BUILD_SCM_REVISION}"
  // echo "::set-output name=STABLE_BUILD_MAJOR_VERSION::${STABLE_BUILD_MAJOR_VERSION}"
  // echo "::set-output name=STABLE_BUILD_MINOR_VERSION::${STABLE_BUILD_MINOR_VERSION}"
  // echo "::set-output name=STABLE_DOCKER_TAG::${STABLE_DOCKER_TAG}"
  // echo "::set-output name=STABLE_SEMVER_VERSION::${STABLE_SEMVER_VERSION}"
  // echo "::set-output name=STABLE_BUILD_DATE::${STABLE_BUILD_DATE}"
  // echo "::set-output name=STABLE_VERSION::${STABLE_VERSION}"
  // echo "::set-output name=GIT_COMMIT::${GIT_COMMIT}"
  // echo "::set-output name=GIT_TREE_STATE::${GIT_TREE_STATE}"
  // echo "::set-output name=GIT_VERSION::${GIT_VERSION}"
  // echo "::set-output name=GIT_MAJOR::${GIT_MAJOR}"
  // echo "::set-output name=GIT_MINOR::${GIT_MINOR}"
  // echo "::set-output name=BUILD_DATE::${BUILD_DATE}"

  //
  // const repo = new Repo();
  // const version = await getVersion();
  // core.debug(`version=${version}`);
  //
  // let release;
  // try {
  //   release =
  //     version === "" || version === "latest"
  //       ? await repo.getLatestRelease()
  //       : await repo.getReleaseByTag(version);
  // } catch (err: unknown) {
  //   throw new Error(
  //     `failed to fetch ${version} release for ${repo.fullName()}: ${err}`
  //   );
  // }
  // core.debug(
  //   `found ${
  //     release.assets().length
  //   } assets for ${version} release of ${repo.fullName()}`
  // );
  //
  // const { platform, arch } = new RustTarget();
  // core.debug(`host system: platform=${platform} arch=${arch}`);
  //
  // // publish-crates-action-x86_64-unknown-linux-gnu.tar.gz
  // const bin = "publish-crates-action";
  // const asset = `${bin}-${arch}-unknown-${platform}-gnu.tar.gz`;
  //
  // let downloaded;
  // try {
  //   downloaded = await release.downloadAsset(asset, { cache: false });
  // } catch (err: unknown) {
  //   throw new Error(`failed to download asset ${asset}: ${err}`);
  // }
  //
  // core.addPath(downloaded);
  // const executable = path.join(downloaded, bin);
  // await exec.exec(executable);
}

run().catch((error) => core.setFailed(error.message));
