# Content Pipeline Cron Worker

Cloudflare Worker that runs hourly to trigger Content Writer batch tasks in Notion. Enables automated content production workflow with hourly task generation.

## Overview

This Worker:
- Runs every hour via Cloudflare cron triggers (`0 * * * *`)
- Creates Content Writer batch tasks in the Content Pipeline database
- Triggers production of 5 articles per batch from active Content Lines
- Supports manual triggering via HTTP endpoints for testing
- Optional D1 logging and KV task queue state

## Features

- ✅ Hourly cron triggers (configurable)
- ✅ Notion API integration for page creation
- ✅ Automatic Content Writer batch generation
- ✅ Health check endpoint with configuration info
- ✅ Manual trigger for testing
- ✅ Error handling and logging
- ✅ Optional D1 database logging
- ✅ Optional KV task queue

## Current Configuration

| Setting | Value |
|---------|-------|
| Target Database | 📝 Content Pipeline (`95850fb41686446aaec2b94ab3e50b92`) |
| Cron Schedule | `0 * * * *` (hourly at :00) |
| Task Type | Content Writer Batch |
| Batch Size | 5 articles per trigger |
| Agent | Content Writer |
| Content Type | Blog Post |

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **Notion Integration** with API token
3. **Content Pipeline Database** access

## Setup

### 1. Clone/Initialize Project

```bash
cd /path/to/ide-inbox-cron
npm install
```

### 2. Get Notion Credentials

#### Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Give it a name: "Content Pipeline Cron"
4. Copy the **Internal Integration Token** (this is your `NOTION_API_TOKEN`)

#### Add Integration to Content Pipeline

1. Open the Content Pipeline database: https://www.notion.so/95850fb41686446aaec2b94ab3e50b92
2. Click **"..."** (top right) → **"Add connections"**
3. Search for and select your integration
4. Copy the database ID from the URL (`95850fb41686446aaec2b94ab3e50b92`)

### 3. Configure Wrangler Secrets

```bash
# Login to Cloudflare
wrangler login

# Set Notion API token
wrangler secret put NOTION_API_TOKEN
# Paste your token when prompted

# Set Content Pipeline database ID
wrangler secret put IDE_INBOX_DB_ID
# Paste: 95850fb41686446aaec2b94ab3e50b92
```

### 4. (Optional) Create D1 Database for Logging

```bash
# Create D1 database
wrangler d1 create ide-inbox-logs

# Note the database ID from output

# Update wrangler.toml with the database ID
# Uncomment the [[d1_databases]] section

# Create migrations directory
mkdir -p migrations

# Migration file is already included: migrations/0001_init.sql

# Apply migrations
wrangler d1 execute ide-inbox-logs --file=migrations/0001_init.sql
```

## Deployment

### Development

```bash
# Start local dev server
npm run dev

# Test locally
curl http://localhost:8787/health
```

### Production Deployment

```bash
# Deploy to Cloudflare
npm run deploy

# View real-time logs
npm run tail
```

## Usage

### Scheduled Execution (Cron)

The Worker runs automatically every hour at the top of the hour (`0 * * * *`).

Each execution creates a Content Writer batch task:
- **Title**: "Write Content Batch — [timestamp]"
- **Status**: "Queued"
- **Agent**: "Content Writer"
- **Content Type**: "Blog Post"
- **Notes**: "Hourly batch trigger. Write 5 articles from Content Lines with Status=Active. Round-robin from active outlines, prioritizing oldest entries first (Status = Outline Needed or Queued)."

### Manual Triggers

#### Health Check

```bash
curl https://ide-inbox-cron.auramediastudios.workers.dev/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-26T04:13:10.958Z",
  "service": "ide-inbox-cron",
  "config": {
    "targetDatabase": "Content Pipeline (95850fb41686446aaec2b94ab3e50b92)",
    "cronSchedule": "0 * * * * (hourly)",
    "taskType": "Content Writer Batch",
    "batchSize": 5
  }
}
```

#### Trigger Hourly Batch

```bash
curl -X POST https://ide-inbox-cron.auramediastudios.workers.dev/trigger
```

#### Create Custom Batch Task

```bash
curl -X POST https://ide-inbox-cron.auramediastudios.workers.dev/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Custom Content Batch",
    "description": "Special batch for featured content",
    "status": "Queued",
    "priority": "High"
  }'
```

## Database Schema

The Worker creates pages in the Content Pipeline database with the following properties:

| Property | Type | Value |
|----------|------|-------|
| Title | Title | "Write Content Batch — [timestamp]" |
| Status | Status | "Queued" |
| Agent | Select | "Content Writer" |
| Content Type | Select | "Blog Post" |
| Notes | Rich Text | Batch instructions |

## Configuration

### Task Schema

```typescript
interface TaskPayload {
  title: string;           // Required: Task title
  description?: string;    // Optional: Additional details (stored in Notes)
  status?: string;         // Default: "Queued"
  priority?: string;       // For logging only
}
```

### Customizing Batch Generation

Edit `src/index.ts` in the `getPendingTasks()` function to modify batch behavior:

```typescript
async function getPendingTasks(env: Env): Promise<TaskPayload[]> {
  const tasks: TaskPayload[] = [];

  // Generate timestamp for batch title
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  // Create Content Writer batch task
  tasks.push({
    title: `Write Content Batch — ${timestamp}`,
    description: `Hourly batch trigger. Write 5 articles from Content Lines with Status=Active.`,
    status: 'Queued',
    priority: 'High'
  });

  return tasks;
}
```

### Cron Schedule

Edit `wrangler.toml` to change the schedule:

```toml
[triggers]
crons = ["0 * * * *"]  # Every hour at :00

# Other examples:
# crons = ["0 */2 * * *"]   # Every 2 hours
# crons = ["0 9,17 * * *"]  # 9 AM and 5 PM daily
# crons = ["*/30 * * * *"]  # Every 30 minutes
```

Cron format: `minute hour day month weekday`

## Monitoring

### View Logs

```bash
# Real-time logs
npm run tail

# Or in Cloudflare Dashboard:
# Workers & Pages → ide-inbox-cron → Logs → Real-time logs
```

### Query D1 Logs

```bash
# Get recent cron executions
wrangler d1 execute ide-inbox-logs --command="SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 10"

# Get recent errors
wrangler d1 execute ide-inbox-logs --command="SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10"
```

## Troubleshooting

### "Notion API error: 401 Unauthorized"

- Check that `NOTION_API_TOKEN` secret is set correctly
- Verify the integration has access to the Content Pipeline database

### "Notion API error: 404 Not Found"

- Check that `IDE_INBOX_DB_ID` is `95850fb41686446aaec2b94ab3e50b92`
- Verify the integration has been added to the database (click "..." on database → "Add connections")

### Cron Not Firing

- Check Worker is deployed: `wrangler deployments list`
- Verify triggers are configured in Cloudflare Dashboard
- Check logs for errors

### Tasks Not Appearing in Notion

- Verify database property names match exactly: `Title`, `Status` (status type), `Agent` (select), `Content Type` (select), `Notes` (rich text)
- Check Worker logs for errors
- Test with `/create` endpoint for immediate feedback

## Architecture

```
┌─────────────────┐
│  Cloudflare     │
│  Cron Trigger   │
│  (hourly @ :00) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Worker         │
│  - Generate     │
│    Batch Task   │
│  - Post to      │
│    Notion API   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Notion API     │
│  /v1/pages      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Content        │
│  Pipeline DB    │
│  (New Page)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Content        │
│  Writer Agent   │
│  Processes 5    │
│  articles       │
└─────────────────┘
```

## Deployment History

| Date | Version | Description |
|------|---------|-------------|
| 2025-12-26 | `ffa857d3` | Initial deployment as Content Pipeline Cron Worker |
| 2025-12-26 | `a8a50b6b` | IDE Inbox Cron Worker (previous) |

## License

MIT

## Author

MKC909

---

**Repository**: https://github.com/mkc909/ide-inbox-cron
**Worker URL**: https://ide-inbox-cron.auramediastudios.workers.dev
**Last Updated**: December 26, 2025
