# Project Rules

## Branch Strategy & Push Policy

- `main` is the release branch. `developer` is the integration branch. Feature branches branch off `developer`, not `main`.
- `main` has GitHub branch protection requiring PRs (direct pushes blocked for collaborators; the repo owner has admin override at the GitHub level, but that override is not to be used silently — see below).
- **No push or merge to `main` happens without an explicit ask-confirm step first** — this applies to every Claude agent/subagent working in this repo, and to the human owner too. The owner has chosen not to use their GitHub admin override to bypass this; the agent currently working the task must explicitly ask ("push/merge PR #N to main now?") and get a yes before it happens, every time, with no standing pre-approval.
- The admin override on GitHub exists only as an emergency escape hatch for a genuinely unforeseen situation (e.g., GitHub outage blocking the PR flow) — not as a convenience path to skip the ask step.
- `developer` has no branch protection; normal PRs or direct pushes there are fine without this extra gate.
