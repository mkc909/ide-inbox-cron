# IDE Agent Inbox Cron Worker

Cloudflare Worker that runs hourly to post tasks to IDE Agent Inbox via Notion API. This enables sub-daily automated task routing since Notion agents only support daily minimum frequency.

## Overview

This Worker:
- Runs every hour via Cloudflare cron triggers (`0 * * * *`)
- Posts tasks to your Notion IDE Agent Inbox database
- Supports manual triggering via HTTP endpoints for testing
- Optional D1 logging and KV task queue state

## Features

- ✅ Hourly cron triggers (configurable)
- ✅ Notion API integration for page creation
- ✅ Time-based task generation rules
- ✅ Health check endpoint
- ✅ Manual trigger for testing
- ✅ Error handling and logging
- ✅ Optional D1 database logging
- ✅ Optional KV task queue

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **Notion Integration** with API token
3. **IDE Agent Inbox Database** ID from Notion

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
3. Give it a name: "IDE Inbox Cron"
4. Copy the **Internal Integration Token** (this is your `NOTION_API_TOKEN`)

#### Find Your Database ID

1. Open your IDE Agent Inbox database in Notion
2. The URL will look like: `https://www.notion.so/username/[DATABASE_ID]?v=...`
3. Copy the 32-character string between the last `/` and `?`
4. This is your `IDE_INBOX_DB_ID`

### 3. Configure Wrangler Secrets

```bash
# Login to Cloudflare
npx wrangler login

# Set Notion API token
npx wrangler secret put NOTION_API_TOKEN
# Paste your token when prompted

# Set IDE Inbox database ID
npx wrangler secret put IDE_INBOX_DB_ID
# Paste your database ID when prompted
```

### 4. (Optional) Create D1 Database for Logging

```bash
# Create D1 database
npx wrangler d1 create ide-inbox-logs

# Note the database ID from output

# Update wrangler.toml with the database ID
# Uncomment the [[d1_databases]] section

# Create migrations directory
mkdir -p migrations

# Create migration file
cat > migrations/0001_init.sql << 'EOF'
CREATE TABLE IF NOT EXISTS cron_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  total_tasks INTEGER NOT NULL,
  success_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  results TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
EOF

# Apply migrations
npx wrangler d1 execute ide-inbox-logs --file=migrations/0001_init.sql
```

### 5. (Optional) Create KV Namespace for Task Queue

```bash
# Create KV namespace
npx wrangler kv namespace create TASK_QUEUE

# Note the namespace ID from output

# Update wrangler.toml with the namespace ID
# Uncomment the [[kv_namespaces]] section
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

# Or deploy to production environment
npm run deploy:production

# View real-time logs
npm run tail
```

## Usage

### Scheduled Execution (Cron)

The Worker runs automatically every hour at the top of the hour (`0 * * * *`).

Tasks are generated based on time-of-day rules:
- **Morning (6-12 AM)**: Daily Code Review
- **Afternoon (12-18 PM)**: Integration Testing
- **Evening (18-24 PM)**: Deployment Checklist

### Manual Triggers

#### Health Check

```bash
curl https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-26T12:00:00.000Z",
  "service": "ide-inbox-cron"
}
```

#### Process All Pending Tasks

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/trigger
```

#### Create Custom Task

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "title": "Emergency Bug Fix",
        "description": "Fix critical issue in production",
        "priority": "High",
        "tags": ["urgent", "production"]
      }
    ]
  }'
```

#### Create Single Task

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Review PR #123",
    "description": "Review and approve pull request",
    "priority": "Medium",
    "tags": ["review", "github"]
  }'
```

## Configuration

### Task Schema

```typescript
interface TaskPayload {
  title: string;           // Required
  description?: string;    // Optional
  priority?: "High" | "Medium" | "Low";
  status?: string;         // Default: "Not Started"
  tags?: string[];         // Array of tag names
}
```

### Customizing Task Generation

Edit `src/index.ts` in the `getPendingTasks()` function to add your own rules:

```typescript
async function getPendingTasks(env: Env): Promise<TaskPayload[]> {
  const tasks: TaskPayload[] = [];
  const hour = new Date().getHours();

  // Add your custom time-based rules
  if (hour === 9) {
    tasks.push({
      title: 'Standup Notes',
      description: 'Prepare daily standup notes',
      priority: 'Medium',
      tags: ['daily', 'standup']
    });
  }

  // Query from KV queue
  const queuedTasks = await env.TASK_QUEUE?.get('pending_tasks');
  if (queuedTasks) {
    const parsed = JSON.parse(queuedTasks);
    tasks.push(...parsed);
  }

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
npx wrangler d1 execute ide-inbox-logs --command="SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 10"

# Get recent errors
npx wrangler d1 execute ide-inbox-logs --command="SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10"
```

## Troubleshooting

### "Notion API error: 401 Unauthorized"

- Check that `NOTION_API_TOKEN` secret is set correctly
- Verify the integration has access to your database

### "Notion API error: 404 Not Found"

- Check that `IDE_INBOX_DB_ID` is correct
- Verify the integration has been added to the database (click "..." on database → "Add connections")

### Cron Not Firing

- Check Worker is deployed: `wrangler deployments list`
- Verify triggers are configured: `wrangler tails`
- Check logs for errors

### Tasks Not Appearing in Notion

- Check database property names match (`Name`, `Description`, `Priority`, `Status`, `Tags`)
- Verify property types (Title, Text, Select, Select, Multi-select)
- Check Worker logs for errors

## Architecture

```
┌─────────────────┐
│  Cloudflare     │
│  Cron Trigger   │
│  (hourly)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Worker         │
│  - Get Tasks    │
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
│  IDE Agent      │
│  Inbox Database │
└─────────────────┘
```

## License

MIT

## Author

MKC909

---

**Last Updated**: December 26, 2025
