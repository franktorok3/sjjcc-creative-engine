# Transfer notes

This codebase is the standalone **sjjcc-creative-engine** app.

It was extracted from `franktorok3/New-SJJCC-intake` branch `cursor/google-canva-basecamp-poc-b3c5` (PR #2) because that PoC belonged in its own repository.

## Finish creating `franktorok3/sjjcc-creative-engine`

The Cursor GitHub App token for this agent is scoped only to `New-SJJCC-intake` and cannot create new repositories. Complete these steps once:

1. On GitHub, create an **empty** private repository: `franktorok3/sjjcc-creative-engine` (no README/license/.gitignore).
2. Grant the **Cursor** GitHub App access to that new repository (same installation that has `New-SJJCC-intake`).
3. Tell the agent to push, **or** run locally:

```bash
git clone https://github.com/franktorok3/New-SJJCC-intake.git
cd New-SJJCC-intake
git fetch origin export/sjjcc-creative-engine
git checkout export/sjjcc-creative-engine
git remote add creative https://github.com/franktorok3/sjjcc-creative-engine.git
git push -u creative export/sjjcc-creative-engine:main
```

4. After the new repo is healthy, close (do not merge) intake PR #2 and delete branch `cursor/google-canva-basecamp-poc-b3c5` if desired. The staging branch `export/sjjcc-creative-engine` can also be deleted.

## Commit

`0c5f87da282afc16e99c7dc9d49d61eb332a9e50`
