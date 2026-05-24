# Pipeline Board Hub

GitHub-centered MVP that unifies pipeline runs, board tasks, and AI-assisted task planning.

## What this implements

- GitHub Actions and Azure Pipelines compatible adapter contract
- Mock pipeline adapter and replay harness for low-data environments
- Board adapter contract with GitHub Projects MVP implementation
- Failed-run to board-item flow
- Automatic board item creation for newly ingested failed runs
- Board item deletion from API and dashboard
- Assignee mapping and assignment endpoint
- AI recommendation endpoint for requirement decomposition, assignee suggestion, and timeline
- Approval gate with low-risk auto-apply policy
- Audit trail for recommendation decisions
- SQLite-backed persistence for runs/items/recommendations/audits
- GitHub webhook signature verification and duplicate event dedupe
- GitHub App installation callback and OAuth code exchange endpoints

## Why these choices

- **GitHub Actions + GitHub Projects first**: fastest vertical slice on a GitHub-first setup
- **Provider adapters**: supports Azure/Jira without rewriting UI/business logic
- **External LLM friendly AI service**: fast iteration; current build uses deterministic mock inference with the same structured output shape
- **Low-risk automation + approval**: balances automation and control

## Other options available

- Azure Pipelines first or Jira first
- Azure OpenAI only or self-hosted models
- Recommend-only workflow (no automation)
- Fully automatic workflow (not recommended for early trust)

## Run locally

```bash
npm install
copy .env.example .env
npm run seed
npm run replay
npm run dev
```

Server runs at `http://localhost:4000`.

## Optional environment variables

- `GITHUB_TOKEN` for live GitHub Actions fetch
- `GITHUB_WEBHOOK_SECRET` for webhook signature verification
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` for app installation token exchange
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` for OAuth code exchange
- `ENABLE_SCHEDULER=true` to run polling/reconciliation jobs
- `ACTIVE_POLL_MINUTES=15` for active repos
- `LOW_POLL_MINUTES=60` for low-activity repos
- `RECONCILE_HOURS=24` for daily drift reconciliation
- `ACTIVE_REPO_THRESHOLD=4` recent runs in 24h to classify repo as active
- `OPENAI_API_KEY` or `LLM_API_KEY` for real LLM recommendations
- `LLM_BASE_URL` for OpenAI-compatible APIs
- `LLM_MODEL` such as `gpt-4o-mini`
- `FAILURE_REPEAT_THRESHOLD=2` to avoid ticket noise
- `FAILURE_LOOKBACK_HOURS=6` for repeated failure checks

## Key endpoints

- `GET /health`
- `GET /api/pipelines/runs?provider=mock&status=failed`
- `POST /api/pipelines/events` (webhook ingest + dedupe)
- `GET /api/pipelines/repos`
- `POST /api/pipelines/repos/register` (`{ "fullName": "owner/repo", "provider": "github-actions" }`)
- `GET /api/pipelines/scheduler/status`
- `POST /api/pipelines/scheduler/poll` (`{ "mode": "active" | "low" }`)
- `POST /api/pipelines/scheduler/reconcile`
- `POST /api/board/items/from-failed-run`
- `PATCH /api/board/items/:id/assign`
- `DELETE /api/board/items/:id`
- `POST /api/board/members/recompute`
- `POST /api/ai/recommendations`
- `POST /api/ai/recommendations/from-failed-run`
- `GET /api/ai/recommendations/pending`
- `POST /api/ai/recommendations/:id/decision`
- `GET /api/github/install/callback?installation_id=...`
- `POST /api/github/oauth/exchange`

## Test

```bash
npm test
```
