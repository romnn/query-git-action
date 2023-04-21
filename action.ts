import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { ExecOutput, ExecOptions } from "@actions/exec";
import * as path from "path";
import { exec as execChildProcess } from "node:child_process";
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
  // const cmdString = cmd.join("");
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
        `command "git ${cmd.join(" ")}" failed with exit code ${
          output.exitCode
        }`
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

function execNative(
  command: string
): Promise<{ error?: string; stdout: string; stderr: string }> {
  return new Promise(function (resolve, reject) {
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

  const gitCommit =
    process.env["GIT_COMMIT"] ??
    (
      await gitCommand(repo, ["rev-parse", "HEAD^{commit}"], { silent: true })
    ).stdout.trim();
  console.log(gitCommit);

  // check if the tree is dirty (default to dirty)
  const gitStatus = (
    await gitCommand(repo, ["status", "--porcelain"], { silent: true })
  ).stdout.trim();
  console.log(gitStatus);
  const isDirty =
    process.env["GIT_TREE_STATE"] ?? gitStatus === "" ? false : true;
  const gitTreeState = isDirty ? "clean" : "dirty";
  console.log(gitTreeState);

  // use git describe to find the version based on tags.
  let gitVersion = (
    await gitCommand(
      repo,
      [
        "describe",
        "--tags",
        "--match=v*",
        "--abbrev=14",
        gitCommit,
        // `${gitCommit}^{commit}`,
      ],
      { silent: true }
    )
  ).stdout.trim();
  console.log(gitVersion);

  // This translates the "git describe" to an actual semver.org
  // compatible semantic version that looks something like this:
  //    v1.1.0-alpha.0.6+84c76d1142ea4d

  // console.log(gitVersion.match());
  const gitVersionParts = gitVersion.split("-");
  // console.log(gitVersionParts);

  // v1.0.0-13-g34467b0668f7c9
  // v1.0.0-13+34467b0668f7c9-dirty

  if (gitVersionParts.length === 4) {
    // we have distance to subversion (v1.1.0-subversion-1-gCommitHash)
    gitVersion = `${gitVersionParts.slice(0, 2).join("-")}.${
      gitVersionParts[2]
    }+${gitVersionParts[3]}`;
  } else if (gitVersionParts.length === 3) {
    // we have distance to base tag (v1.1.0-1-gCommitHash)
    gitVersion = `${gitVersionParts.slice(0, 2).join("-")}+${
      gitVersionParts[2]
    }`;
  }
  if (isDirty) {
    // git describe --dirty only considers changes to existing files, but
    // that is problematic since new untracked .go files affect the build,
    // so use our idea of "dirty" from git status instead.
    gitVersion += "-dirty";
  }
  console.log(gitVersion);

  // Try to match the "git describe" output to a regex to try to extract
  // the "major" and "minor" versions and whether this is the exact tagged
  // version or whether the tree is between two tagged versions.
  const maybeSemVer = /^v([0-9]+)\.([0-9]+)(\.[0-9]+)?([-].*)?([+].*)?$/;
  const maybeSemVerMatch = gitVersion.match(maybeSemVer);
  if (maybeSemVerMatch) {
    console.log(maybeSemVerMatch);
    const gitMajor = maybeSemVerMatch[1];
    let gitMinor = maybeSemVerMatch[2];
    if (maybeSemVerMatch.length > 4 && maybeSemVerMatch[4]) {
      gitMinor += "+";
    }
    console.log(gitMajor, gitMinor);
  }

  // If not a valid semantic version, fail
  const validSemVer = /^v([0-9]+)\.([0-9]+)(\.[0-9]+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
  if (!gitVersion.match(validSemVer)) {
    core.setFailed(
      `git version should be a valid semantic version. current value: ${gitVersion}`
    );
  }

  core.setOutput("STABLE_BUILD_GIT_COMMIT", gitCommit);
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
}

run().catch((error) => core.setFailed(error.message));
