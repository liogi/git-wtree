---
name: release
description: Prepare a release of git-wtree — bump the version, write the CHANGELOG entry from the merged PRs, and open the release branch. Use when the user asks to release, cut a version, prepare 0.9.0, or write the changelog.
---

# Preparing a release

Takes a bump type (`patch`, `minor`, `major`) or an explicit version. Produces a
release branch ready to review — the mechanical parts done, the changelog
written from real material rather than from commit subjects.

## 1. Check the ground

```bash
git checkout main && git pull
git status --short          # must be clean
npm test                    # must pass before anything else
```

Stop and say so if either fails. Never prepare a release on a dirty tree.

## 1b. Check there is anything to release

A version whose installed contents are identical to the last one is noise: an
entry in the version history, a notification, and nothing for anyone to gain.
Only what `files` in package.json ships can matter to a user — today `dist`,
`CHANGELOG.md`, `LICENSE`, `README.md`.

```bash
LAST=$(git describe --tags --abbrev=0)
git diff --stat "$LAST"..main
```

Nothing outside those paths is publishable on its own. Repository tooling —
`.claude/`, `.github/`, `tests/`, `tsconfig*.json` — never reaches the package.

`README.md` needs judgement rather than a rule: a correction users read is worth
a patch, a section about the maintainer's own workflow is not.

If nothing publishable changed, **say so and stop**. Name what did change and
why it does not ship, then leave the decision with the user rather than
preparing a release they did not need. Preparing it anyway and letting them
notice at the last question wastes the review.

## 2. Bump

Accepts `patch`, `minor`, `major`, or an explicit version like `1.0.0`.

```bash
npm version <patch|minor|major|x.y.z> --no-git-tag-version
git checkout -b release/$(node -p "require('./package.json').version")
```

Choosing, when the user did not say:

- **patch** — fixes only; nothing new, and nothing changes for someone already
  using it
- **minor** — a new command or option, a behaviour that changes, **and anything
  breaking, while the version is still 0.x**

### `major` is not "there is a breaking change"

While on 0.x, `major` produces **1.0.0**, which is a statement rather than an
increment: it promises that `.gitwtree.json` and the shell wrapper will not
force a migration again without another major. In 0.x, breaking changes belong
in the minor — that is what 0.x is for.

So never pick `major` on your own. Only when the user asks for it explicitly,
and then check with them that they mean 1.0 and not just "this breaks
something".

The criterion agreed for 1.0: a release that forces nobody to re-run
`gitwtree shell-init --install` and nobody to migrate `.gitwtree.json`, after
those formats have gone some weeks without needing to change. Necessary, not
sufficient — a quiet release the day after a noisy one proves nothing.

Once past 1.0, `major` means what it usually means.

## 3. Gather the raw material

The commit subjects are not the material. The PR bodies are: they were written
to explain why a change matters, which is exactly what a changelog needs and
what `git log` does not carry.

```bash
LAST=$(git describe --tags --abbrev=0 --exclude="$(node -p "'v'+require('./package.json').version")")
DATE=$(git log -1 --format=%aI "$LAST")
gh pr list --repo liogi/git-wtree --state merged --search "merged:>$DATE" \
  --json number,title,body --limit 50
```

Read every body. Where one is thin, read the diff.

## 4. Write the entry

Insert a `## <version>` section at the top of `CHANGELOG.md`, above the previous
one. Order sections by what the reader needs first:

1. **⚠️ Upgrading** — only if something is required of them: a Node floor, a
   `gitwtree shell-init --install`, a config migration. If nothing is required,
   say so in one line: *Nothing to reinstall — the shell wrapper is unchanged.*
2. **Fixed — security**, if any
3. **Fixed — data loss**, if any
4. **Added**
5. **Changed**
6. **Fixed — everything else**
7. **Internal** — dependency bumps, a raised Node floor, and notable additions
   to the repository itself. This section is for the maintainer reading their
   own history later, not for someone deciding whether to upgrade, so keep it to
   a line or two per item and never let it justify a release on its own: step 1b
   still applies. Say plainly when something does not ship.

### How to write each entry

Write for someone deciding whether to upgrade, not for someone reviewing a diff.

- **Lead with the consequence, not the change.** Not "refactor worktree path
  resolution" but "`gwt add` created worktrees named after other worktrees".
- **Say when it was reachable.** "Reachable through `gwt pr`, which exists to
  check out branches from forks" tells the reader whether it applies to them.
- **Show the symptom** when a two-line snippet makes it obvious.
- **Never claim a benefit that was not measured.** No "improves performance"
  without a number. A dry sentence beats a confident wrong one — this document
  is one people act on.
- **Say what stays the same** when it removes a worry: *Nothing to reinstall.*

Keep the existing entries' voice: plain sentences, no marketing, no emoji beyond
the one ⚠️ marker.

## 5. Open the PR

```bash
git commit -am "<version>"
git push -u origin release/<version>
gh pr create --title "<version>" --body "<the changelog section>"
```

## 6. Ask before going further

Show the changelog section in the reply — the user should not have to open the
PR to judge it — then ask with AskUserQuestion:

- **question**: "Cette release te va ?"
- **header**: "Release"
- options:
  1. `Oui — merger et taguer` — *"la PR est mergée, le tag poussé, le paquet mis en attente sur npm"*
  2. `Non — laisser en l'état` — *"la branche et la PR restent, rien n'est mergé"*

"Other" is offered automatically and is how the user asks for changes: rewrite
the changelog, force-push the branch, and ask again. Do not proceed on anything
short of the explicit yes.

## 7. On yes: merge, tag, and report

First check which account `gh` is on. It is global state on this machine and
another terminal working under `~/codebases/primo` flips it, so it drifts
mid-session and `gh pr merge` then fails with "must be a collaborator" — an
error that says nothing about the real cause.

```bash
gh api user --jq .login          # must be liogi
# if not: gh auth switch --hostname github.com --user liogi
```

Wait for CI before merging — never merge a red release.

```bash
until ! gh pr checks <pr> --repo liogi/git-wtree | grep -qE "pending|no checks"; do sleep 10; done
gh pr checks <pr> --repo liogi/git-wtree      # abort and say so if it failed
gh pr merge <pr> --repo liogi/git-wtree --merge

git checkout main && git pull
git tag v<version> && git push --tags
```

Then watch the publish run and report what happened:

```bash
until ! gh run list --repo liogi/git-wtree --limit 1 --json status --jq '.[0].status' | grep -q in_progress; do sleep 10; done
gh run list --repo liogi/git-wtree --limit 1
```

Finish by telling the user, in one short block:

1. the version is **staged, not published** — `npm view git-wtree version` still
   shows the previous one, and that is correct
2. to approve it: npmjs.com → **Staged Packages** → Approve, with 2FA
3. what the release asks of users, if anything

If the publish run failed, say so plainly with the error and stop. Nothing is
published, and the tag can be moved:
`git tag -d v<version> && git push origin :refs/tags/v<version>`.

## What this skill does not do

It does not approve the staged package. That step needs 2FA and it is the only
thing standing between this repository and the registry — automating it would
undo the reason staged publishing was chosen. It stays with the user, always.
