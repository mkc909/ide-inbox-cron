# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Get Notion Credentials

### A. Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "+ New integration"
3. Name: "IDE Inbox Cron Worker"
4. Attach to: Select your workspace
5. Click "Submit"
6. **Copy the Internal Integration Token** (starts with `secret_`)

### B. Find Your Database ID

1. Open your IDE Agent Inbox in Notion
2. The URL looks like: `https://www.notion.so/username/[DATABASE_ID]?v=...`
3. Copy the 32-character string between last `/` and `?`
4. Example: If URL is `https://notion.so/workspaces/Workspace/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6?v=...`
5. Database ID is: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### C. Add Integration to Database

1. Open your IDE Agent Inbox database in Notion
2. Click "..." (top right of database)
3. Click "Add connections"
4. Select your "IDE Inbox Cron Worker" integration

## Step 3: Configure Cloudflare

### Login to Cloudflare

```bash
npx wrangler login
```

This will open a browser for authentication.

### Set Secrets

```bash
# Set Notion API token
npx wrangler secret put NOTION_API_TOKEN
# Paste your token (starts with secret_)

# Set Database ID
npx wrangler secret put IDE_INBOX_DB_ID
# Paste your 32-character database ID
```

## Step 4: Deploy

```bash
# Deploy to Cloudflare
npm run deploy

# Verify deployment
curl https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-26T...",
  "service": "ide-inbox-cron"
}
```

## Step 5: Test

### Test manual trigger

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/trigger
```

### Test single task creation

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Task from API",
    "description": "This is a test task created via API",
    "priority": "High"
  }'
```

Check your Notion IDE Agent Inbox - you should see the new task!

## Optional: Enable D1 Logging

### Create database

```bash
npx wrangler d1 create ide-inbox-logs
```

Note the database ID from output.

### Update wrangler.toml

Uncomment and update:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ide-inbox-logs"
database_id = "YOUR_DATABASE_ID_HERE"
```

### Apply migrations

```bash
npx wrangler d1 execute ide-inbox-logs --file=migrations/0001_init.sql --local
npx wrangler d1 execute ide-inbox-logs --file=migrations/0001_init.sql --remote
```

### Redeploy

```bash
npm run deploy
```

## Troubleshooting

### "Unknown error" or 401

- Check NOTION_API_TOKEN is set correctly
- Verify integration has access to database

### "Database not found" or 404

- Check IDE_INBOX_DB_ID is correct
- Verify integration is added to database connections

### Cron not running

- Check Worker is deployed: `npx wrangler deployments list`
- View logs: `npm run tail`
- Check Cron Triggers section in Cloudflare Dashboard

### Tasks not appearing

- Check database property names match (case-sensitive):
  - `Name` (Title type)
  - `Description` (Text type)
  - `Priority` (Select type)
  - `Status` (Select type)
  - `Tags` (Multi-select type)

## Next Steps

- Customize `getPendingTasks()` function for your needs
- Adjust cron schedule in `wrangler.toml`
- Set up monitoring and alerts
- Add more task generation rules

---

**Need Help?** Check the main README.md or view logs with `npm run tail`
