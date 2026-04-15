# web-to-figma — project conventions

These rules OVERRIDE the global `~/.claude/CLAUDE.md` for this project. All other rules from the global CLAUDE.md still apply.

## Commit policy (overrides "never commit without approval")

**Auto-commit is ALLOWED for this project.** The main agent and subagents may `git commit` without asking, following the commit steps in the implementation plan.

**Auto-push is ALSO allowed** for this project. The user has explicitly approved push operations.

**Still required:**
- Commit messages in English
- Conventional commits style (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`)
- Any destructive git action (force-push, reset --hard, branch delete) requires explicit user approval

## Code style (reminder — already in global)
- TypeScript, functional components, arrow functions
- **No semicolons**
- No inline Tailwind — CSS Modules or scoped CSS only
- CSS variables for design tokens
