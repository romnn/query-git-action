import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { ExecOutput, ExecOptions } from "@actions/exec";
import * as path from "path";

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

function secondsSinceEpoch(d: Date): number {
  const utcMillisSinceEpoch = d.getTime();
  // + (d.getTimezoneOffset() * 60 * 1000);
  const utcSecsSinceEpoch = Math.round(utcMillisSinceEpoch / 1000);
  return utcSecsSinceEpoch;
}

async function getGitVersion(repo: {
  repo: string;
  commit: string;
}): Promise<string> {
  // use git describe to find the version based on tags.
  let gitVersion = (
    await gitCommand(
      repo.repo,
      ["describe", "--tags", "--match=v*", "--abbrev=14", repo.commit],
      { silent: true }
    )
  ).stdout.trim();

  // This translates the "git describe" to an actual semver.org
  // compatible semantic version that looks something like this:
  //    v1.1.0-alpha.0.6+84c76d1142ea4d

  const gitVersionParts = gitVersion.split("-");

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

  return gitVersion;
}

function getBuildDate(): string {
  const buildDate = new Date();
  const d = {
    year: buildDate.getFullYear(),
    month: ("0" + (buildDate.getMonth() + 1)).slice(-2),
    day: ("0" + buildDate.getDate()).slice(-2),
    // monthName: monthNames[buildDate.getMonth()],
    monthName: buildDate.toLocaleString("en-us", { month: "short" }),
    epoch: secondsSinceEpoch(buildDate),
  };
  // 23-04-26tApr:04:1682515664z
  // $(date -u +'%y-%m-%dt%h:%m:%sz')
  return `${d.year}-${d.month}-${d.day}t${d.monthName}:${d.month}:${d.epoch}z`;
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

  // check if the tree is dirty (default to dirty)
  const gitStatus = (
    await gitCommand(repo, ["status", "--porcelain"], { silent: true })
  ).stdout.trim();
  const isDirty =
    process.env["GIT_TREE_STATE"] ?? gitStatus === "" ? false : true;
  const gitTreeState = isDirty ? "clean" : "dirty";

  let gitVersion = await getGitVersion({ repo, commit: gitCommit });
  if (isDirty) {
    // git describe --dirty only considers changes to existing files, but
    // that is problematic since new untracked .go files affect the build,
    // so use our idea of "dirty" from git status instead.
    gitVersion += "-dirty";
  }

  // Try to match the "git describe" output to a regex to try to extract
  // the "major" and "minor" versions and whether this is the exact tagged
  // version or whether the tree is between two tagged versions.
  const maybeSemVer = /^v([0-9]+)\.([0-9]+)(\.[0-9]+)?([-].*)?([+].*)?$/;
  const maybeSemVerMatch = gitVersion.match(maybeSemVer);
  let gitMajor,
    gitMinor = "";
  if (maybeSemVerMatch) {
    gitMajor = maybeSemVerMatch[1];
    gitMinor = maybeSemVerMatch[2];
    if (maybeSemVerMatch.length > 4 && maybeSemVerMatch[4]) {
      gitMinor += "+";
    }
  }

  // If not a valid semantic version, fail
  const validSemVer = /^v([0-9]+)\.([0-9]+)(\.[0-9]+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
  if (!gitVersion.match(validSemVer)) {
    core.setFailed(
      `git version should be a valid semantic version. current value: ${gitVersion}`
    );
  }

  core.setOutput("GIT_COMMIT", gitCommit);
  core.setOutput("SCM_STATUS", gitTreeState);
  core.setOutput("TREE_STATE", gitTreeState);
  core.setOutput("SCM_REVISION", gitVersion);
  core.setOutput("MAJOR_VERSION", gitMajor);
  core.setOutput("MINOR_VERSION", gitMinor);
  const stableDockerTag = gitVersion.replace("+", "_");
  core.setOutput("DOCKER_TAG", stableDockerTag);
  core.setOutput("SEMVER_VERSION", stableDockerTag.split("-")[0]);
  core.setOutput("BUILD_DATE", getBuildDate());
}

run().catch((error) => core.setFailed(error.message));
