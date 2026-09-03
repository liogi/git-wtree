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

## 2. Bump

```bash
npm version <patch|minor|major> --no-git-tag-version
git checkout -b release/$(node -p "require('./package.json').version")
```

Choosing the type, when the user did not say:

- **patch** — fixes only, nothing new, nothing changed for someone already using it
- **minor** — a new command or option, or a behaviour that changes
- **major** — only if a config format or the shell wrapper forces users to migrate

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
7. **Internal** — dependencies, tests, CI

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

## 5. Hand it back

```bash
git commit -am "<version>"
git push -u origin release/<version>
gh pr create --title "<version>" --body "<the changelog section, plus the release steps>"
```

Then tell the user, in this order:

1. the PR link
2. what the release requires of users, if anything
3. that publishing is: merge → `git tag v<version> && git push --tags` → approve
   the staged package on npmjs.com with 2FA

## What this skill does not do

It does not tag and does not publish. Tagging is the explicit act that starts a
release; it stays with the user, and CI does the rest from there.
