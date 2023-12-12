import { Octokit } from "@octokit/rest";
import "dotenv/config";

const octokit = new Octokit({ auth: process.env?.GH_TOKEN ?? process.env?.GITHUB_TOKEN });
const [owner, repo] = (process.env.GH_REPOSITORY ?? process.env?.GITHUB_REPOSITORY)?.split("/") ?? [];
const readmePath = process.env?.README_PATH ?? "README.md";
const description =
  "::Github Tracker:: List followers/unfollowers --- Recent followers/unfollowers automatically removed after 7 days";
const removeRecentAfter = process.env?.REMOVE_RECENT_AFTER ?? 7 * 24 * 60 * 60 * 1000;

const updateOrCreateGist = async () => {
  const gist_id = await octokit.gists
    .list()
    .then(({ data }) => data.find((data) => data.description === description)?.id ?? null)
    .catch(() => null);
  const followers = await octokit.users.listFollowersForUser({
    username: owner,
  });

  const followerNames = followers.data.map((follower) => follower.login);

  let unfollowers = [];
  let savedRecentUnfollowers = [];
  let recentUnfollowers = [];
  let savedRecentFollowers = [];
  let recentFollowers = [];

  if (gist_id) {
    const {
      data: { files },
    } = await octokit.gists.get({ gist_id });

    const oldFollowers = JSON.parse(files["followers.json"].content);
    const followers = [...new Set([...followerNames, ...oldFollowers])];
    const now = Date.now();

    if (files["followers.json"]) {
      unfollowers = oldFollowers.filter((follower) => !followerNames.includes(follower));
    }

    if (files["unfollowers.json"]) {
      const oldUnfollowers = JSON.parse(files["unfollowers.json"].content);
      unfollowers = [...new Set([...unfollowers, ...oldUnfollowers])];
      unfollowers = unfollowers.filter((unfollower) => !followerNames.includes(unfollower));
    }

    if (files["recent-followers.json"]) {
      savedRecentFollowers = JSON.parse(files["recent-followers.json"].content);
    }

    recentFollowers = followerNames.filter((followerName) => !oldFollowers.includes(followerName));
    recentFollowers = recentFollowers.map((recentFollower) => ({
      username: recentFollower,
      timestamp: now,
    }));

    savedRecentFollowers = savedRecentFollowers.filter(
      (savedRecentFollower) =>
        !recentFollowers.find((recentFollower) => recentFollower.username === savedRecentFollower.username),
    );
    recentFollowers = [...new Set([...recentFollowers, ...savedRecentFollowers])];

    recentFollowers = recentFollowers.filter(
      (recentFollower) => !unfollowers.find((unfollower) => unfollower === recentFollower.username),
    );

    recentFollowers = recentFollowers.filter(
      (recentFollower) => new Date() - recentFollower.timestamp < removeRecentAfter,
    );

    if (files["recent-unfollowers.json"]) {
      savedRecentUnfollowers = JSON.parse(files["recent-unfollowers.json"].content);
    }

    recentUnfollowers = unfollowers
      .filter((unfollower) => followers.includes(unfollower))
      .map((recentUnfollower) => ({
        username: recentUnfollower,
        timestamp: now,
      }));

    savedRecentUnfollowers = savedRecentUnfollowers.filter(
      (savedRecentUnfollower) =>
        !recentUnfollowers.find(
          (recentUnfollower) => recentUnfollower.username === savedRecentUnfollower.username,
        ),
    );

    recentUnfollowers = [...new Set([...recentUnfollowers, ...savedRecentUnfollowers])];

    recentUnfollowers = recentUnfollowers.filter(
      (recentUnfollower) =>
        !recentFollowers.find((recentFollower) => recentFollower.username === recentUnfollower.username),
    );

    recentUnfollowers = recentUnfollowers.filter(
      (recentUnfollower) => new Date() - recentUnfollower.timestamp < removeRecentAfter,
    );
  }

  const files = {
    "followers.json": {
      content: JSON.stringify(followerNames, null, 2),
    },
    "unfollowers.json": {
      content: JSON.stringify(unfollowers, null, 2),
    },
    "recent-followers.json": {
      content: JSON.stringify(recentFollowers, null, 2),
    },
    "recent-unfollowers.json": {
      content: JSON.stringify(recentUnfollowers, null, 2),
    },
  };

  if (gist_id) {
    console.log("[Tracker] Updating list...");
    await octokit.gists.update({
      gist_id,
      files,
    });
  } else {
    console.log("[Tracker] Gist doesn't exist, creating new list...");
    await octokit.gists.create({
      description,
      files,
      public: false,
    });
  }
};

const updateReadme = async () => {
  const gist_id = await octokit.gists
    .list()
    .then(({ data }) => data.find((data) => data.description === description)?.id ?? null)
    .catch(() => null);
  let {
    data: { files },
  } = await octokit.gists.get({ gist_id });
  const data = Object.keys(files).reduce((result, key) => {
    result[key] = JSON.parse(files[key].content);
    return result;
  }, {});

  let markdownTable = "";
  const recentFollowed = data["recent-followers.json"].map(({ username }) => username);
  const recentUnfollowed = data["recent-unfollowers.json"].map(({ username }) => username);

  if (recentFollowed.length && recentUnfollowed.length) {
    markdownTable += "| Recently Followed | Recently Unfollowed |\n| :---: | :---: |\n";
    for (let i = 0; i < Math.max(recentFollowed.length, recentUnfollowed.length); i++) {
      const followed = recentFollowed[i] ? `[${recentFollowed[i]}](https://github.com/${recentFollowed[i]})` : "";
      const unfollowed = recentUnfollowed[i]
        ? `[${recentUnfollowed[i]}](https://github.com/${recentUnfollowed[i]})`
        : "";
      markdownTable += `| ${followed} | ${unfollowed} |\n`;
    }
  } else if (recentFollowed.length) {
    markdownTable += "| Recently Followed |\n| :---: |\n";
    recentFollowed.forEach((username) => {
      markdownTable += `| [${username}](https://github.com/${username}) |\n`;
    });
  } else if (recentUnfollowed.length) {
    markdownTable += "| Recently Unfollowed |\n| :---: |\n";
    recentUnfollowed.forEach((username) => {
      markdownTable += `| [${username}](https://github.com/${username}) |\n`;
    });
  }

  const { data: currentReadme } = await octokit.repos.getContent({
    owner,
    repo,
    path: readmePath,
  });

  let readmeContents = Buffer.from(currentReadme.content, "base64").toString("utf8");
  const startMarker = "<!-- start: github-tracker -->";
  const endMarker = "<!-- end: github-tracker -->";

  if (readmeContents.includes(startMarker) || readmeContents.includes(endMarker)) {
    const [startString, rest] = readmeContents.split(startMarker);
    const [_, endString] = rest.split(endMarker);

    readmeContents = `${startString}${startMarker}\n${markdownTable.trim()}\n${endMarker}${endString}`;
  }

  if (readmeContents.trim() !== Buffer.from(currentReadme.content, "base64").toString("utf8").trim()) {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: readmePath,
      sha: currentReadme.sha,
      content: Buffer.from(readmeContents).toString("base64"),
      message: "chore(tracker) Update README",
    });

    console.log("[Tracker] Updating README!");
  } else {
    console.log("[Tracker] No changes, skip...");
  }
};

const main = async () => {
  await updateOrCreateGist();
  await updateReadme();
  console.log("[Tracker] Done!");
};

main();
