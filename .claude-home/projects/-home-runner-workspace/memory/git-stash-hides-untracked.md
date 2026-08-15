---
name: git-stash-hides-untracked
description: "git stash show and git log --all both hide untracked files stored in a stash, which can make real work look nonexistent"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e4f65deb-20f6-43d9-bf35-49c5e86df498
  modified: 2026-08-08T05:20:13.096Z
---

In this repo I concluded a large feature "had never been built on any branch" and
told Oliver so. It was wrong: ~4,400 lines were sitting in `stash@{1}` as
**untracked** files and only appeared once I ran `git stash apply`.

**Why:** a stash made with `--include-untracked` stores those files in a **third
parent**, `stash@{N}^3`. Neither of the obvious checks sees it:

- `git stash show [--stat] stash@{N}` diffs `^1..stash` only — tracked changes.
- `git log --all` traverses `refs/heads`, `refs/tags`, `refs/remotes` — **not**
  `refs/stash`.
- `ls` of the target directory finds nothing, because the files aren't on disk.

**How to apply:** before concluding that work doesn't exist, check the untracked
parent of every stash explicitly:

```sh
git stash list
for s in $(seq 0 $(( $(git stash list | wc -l) - 1 ))); do
  echo "--- stash@{$s}^3 ---"; git ls-tree -r --name-only "stash@{$s}^3" 2>/dev/null
done
```

Note `git ls-tree -r stash@{N}` lists the *entire repo tree*, not the changed
files, so it is useless for "was this file modified" — use it only against `^3`.

A second trap from the same session: `git add <dir>` also stages whatever a
**concurrent agent session** has edited under that directory. Separate the two by
mtime before committing (`stat -c %y`), and stage by explicit path. Related:
[[landing-phone-demo-status]].
