# Workforce AI Impact Analysis Platform

## Quick Start — Claude Code on Windows

### Prerequisites
```powershell
# Node.js 18+ required
node --version

# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

### Start a Session
```powershell
cd workforce-ai-platform
claude
```

Claude Code reads `CLAUDE.md` automatically. The two-tier architecture, data model invariants, and privacy rules are loaded every session — you don't need to re-explain them.

### Use Sub-Agents
Invoke by name or let Claude Code match by description:
```
"Use the fr8-drift-engine agent to build the AEI ingestion pipeline"
"Use a sub-agent to review these dashboard endpoints for privacy compliance"
```

### Use Slash Commands
```
/build-tier1 sector="Electricity & Gas" naics="2211"
/validate-privacy path="src/backend/dashboards/"
```

### Recommended First Session
```
Read CLAUDE.md and docs/domain-model.md.

I want to start with Tier 1. Set up the project structure:
- Python FastAPI backend in src/backend/
- PostgreSQL with Alembic migrations in src/backend/migrations/
- React frontend in src/frontend/

Then scaffold the database schema for FR-8.1 (AEI snapshots) and FR-8.4 (industry profiles).
Start with the Alembic migration files only — no application code yet.
```

## Project Structure
```
workforce-ai-platform/
├── CLAUDE.md                    # Auto-loaded by Claude Code — project context
├── AGENTS.md                    # Universal agent context (Cursor, Gemini, etc.)
├── README.md                    # This file
├── .claude/
│   ├── agents/                  # Sub-agents for isolated tasks
│   │   ├── fr2-matching.md      # O*NET title matching
│   │   ├── fr8-drift-engine.md  # Tier 1 intelligence pipeline
│   │   ├── privacy-reviewer.md  # Privacy compliance auditor
│   │   └── security-reviewer.md # Security auditor
│   └── commands/                # Slash command workflows
│       ├── build-tier1.md       # /build-tier1
│       └── validate-privacy.md  # /validate-privacy
├── docs/
│   ├── domain-model.md          # Data contracts and invariants (read this first)
│   ├── fr8-role-evolution.md    # Tier 1 drift engine spec
│   ├── fr1-hierarchy.md         # Tier 2 hierarchy spec
│   ├── security.md              # Auth, RBAC, privacy implementation
│   └── testing.md               # Test strategy and coverage targets
├── ai_working/
│   ├── decisions/               # Architecture Decision Records (ADRs)
│   ├── discoveries/             # Implementation patterns and learnings
│   └── context/
│       └── implementation-status.md
└── src/                         # Created by Claude Code during build
    ├── backend/
    └── frontend/
```

## Key Design Decisions
- **Tier 1 builds first** — delivers value with zero org data; unblocks client demos
- **CLAUDE.md is lean** — critical rules only; detailed specs live in docs/
- **Sub-agents protect context** — privacy-reviewer and security-reviewer run in isolated windows
- **AEI is append-only** — new data releases never modify historical records
- **Industry crosswalk is a config layer** — swap NAICS→ANZSIC without touching the drift engine

## Key Docs
- Domain invariants and data contracts: `docs/domain-model.md`
- Why the two-tier architecture exists: see AGENTS.md
- Build sequence and blockers: `CLAUDE.md` Build Dependency Chain section
