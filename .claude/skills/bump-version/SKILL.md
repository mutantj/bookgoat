---
name: bump-version
description: Bump Bookgoat's patch version (e.g. 0.0.19 → 0.0.20) in package.json and package-lock.json, then commit just that as "Set the version to x.y.z". Use when the developer says "update the version number", "bump the version" or runs /bump-version.
---

# Bump the version and commit

The version shows on the home screen. It lives in `package.json` (line 3) and `package-lock.json` (lines 3 and 9).

1. Load Node first: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`
2. Look at `git status --short`. Other uncommitted changes are fine, but they stay out of this commit. If `package.json` or `package-lock.json` already has changes, stop and ask the developer what to do.
3. Bump the patch number in both files:
   ```
   npm version patch --no-git-tag-version --ignore-scripts
   ```
   It prints the new version (e.g. `v0.0.20`). It changes only those three lines and doesn't make a git tag. If the developer asks for a minor or major bump instead, use `minor` or `major`.
4. Check `git diff package.json package-lock.json` shows only the three version lines.
5. Commit only those two files, with the subject alone and no body:
   ```
   git add package.json package-lock.json
   git commit -m "Set the version to 0.0.20" -m "<the attribution lines the session gives you>"
   ```
6. Don't push; the developer pushes. Report the new version and the commit hash, and mention any other changes that were left uncommitted.
