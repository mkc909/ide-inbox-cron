# Deployment Checklist

## Pre-Deployment Requirements

- [ ] Notion Integration created and API token obtained
- [ ] IDE Agent Inbox Database ID obtained
- [ ] Integration added to database connections in Notion
- [ ] Cloudflare account with Workers enabled
- [ ] Wrangler CLI installed (`npm install -g wrangler`)

## Step-by-Step Deployment

### 1. Install Dependencies

```bash
cd /home/claude/workspace/.projects/personal/ide-inbox-cron
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

This will open a browser window for authentication.

### 3. Configure Secrets

```bash
# Set Notion API token
npx wrangler secret put NOTION_API_TOKEN
# Paste your token when prompted (starts with secret_)

# Set Database ID
npx wrangler secret put IDE_INBOX_DB_ID
# Paste your 32-character database ID
```

### 4. (Optional) Create D1 Database for Logging

```bash
# Create database
npx wrangler d1 create ide-inbox-logs

# Copy the database ID from output

# Update wrangler.toml:
# Uncomment the [[d1_databases]] section
# Replace YOUR_DATABASE_ID_HERE with actual ID

# Apply migrations
npx wrangler d1 execute ide-inbox-logs --file=migrations/0001_init.sql --remote
```

### 5. Deploy Worker

```bash
npm run deploy
```

Expected output:
```
✨ Built successfully
✨ Deployed successfully!
Published ide-inbox-cron (X.XX sec)
  https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev
```

### 6. Verify Deployment

```bash
# Health check
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

### 7. Test Manual Trigger

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/trigger
```

Check your Notion IDE Agent Inbox - you should see new tasks appear!

### 8. Test Single Task Creation

```bash
curl -X POST https://ide-inbox-cron.YOUR_SUBDOMAIN.workers.dev/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deployment Test Task",
    "description": "This task was created to test the deployment",
    "priority": "High",
    "tags": ["test", "deployment"]
  }'
```

## Post-Deployment Verification

- [ ] Health check endpoint returns 200 OK
- [ ] Manual trigger creates tasks in Notion
- [ ] Single task creation works
- [ ] Check Cloudflare Dashboard: Worker shows "Success" status
- [ ] Cron triggers visible in Cloudflare Dashboard
- [ ] View logs: `npm run tail`

## Monitoring

### Real-time Logs

```bash
npm run tail
```

### Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Navigate to: Workers & Pages → ide-inbox-cron
3. Click "Logs" → "Real-time logs"
4. Click "Begin log stream"

### Cron Triggers

In Cloudflare Dashboard:
1. Workers & Pages → ide-inbox-cron
2. Click "Triggers" tab
3. Verify cron: `0 * * * *` appears
4. Check "Last run" timestamp

## Troubleshooting

### Worker returns 404

- Check deployment succeeded: `npx wrangler deployments list`
- Verify URL is correct: `npx wrangler deployments list --output json`
- Redeploy: `npm run deploy`

### Notion API returns 401

- Verify NOTION_API_TOKEN secret is set
- Check token starts with `secret_`
- Regenerate integration token in Notion if needed

### Notion API returns 404

- Verify IDE_INBOX_DB_ID is correct (32 characters)
- Check integration is added to database connections
- Open database in Notion → "..." → "Add connections"

### Tasks not appearing in Notion

- Verify database property names match exactly:
  - `Name` (Title type)
  - `Description` (Text type, optional)
  - `Priority` (Select type, optional)
  - `Status` (Select type, optional)
  - `Tags` (Multi-select type, optional)

### Cron not firing

- Check triggers are configured: Dashboard → Workers → Triggers
- View logs: `npm run tail`
- Check Worker status in Dashboard (should be "Success")

## Customization

### Change Cron Schedule

Edit `wrangler.toml`:

```toml
[triggers]
crons = ["0 */2 * * *"]  # Every 2 hours
```

Redeploy after changing:
```bash
npm run deploy
```

### Add Custom Task Rules

Edit `src/index.ts` in `getPendingTasks()` function:

```typescript
async function getPendingTasks(env: Env): Promise<TaskPayload[]> {
  const tasks: TaskPayload[] = [];
  const hour = new Date().getHours();

  // Your custom rules
  if (hour === 10) {
    tasks.push({
      title: 'Custom Morning Task',
      description: 'Runs at 10 AM every day',
      priority: 'Medium',
      tags: ['custom']
    });
  }

  return tasks;
}
```

### Enable D1 Logging

1. Create D1 database (see step 4 above)
2. Uncomment `[[d1_databases]]` in `wrangler.toml`
3. Apply migrations
4. Redeploy

Logs will be stored in `cron_logs` and `error_logs` tables.

## Success Criteria

✅ **Deployment Successful When:**
- Health check returns 200 OK
- Manual trigger creates tasks in Notion IDE Inbox
- Cron triggers visible in Cloudflare Dashboard
- Logs show successful execution
- Tasks appear with correct properties (title, description, priority, tags)

## Next Steps

After successful deployment:

1. **Monitor first cron execution** - Wait for top of next hour
2. **Verify tasks created** - Check Notion IDE Agent Inbox
3. **Review logs** - `npm run tail`
4. **Customize task rules** - Edit `getPendingTasks()` function
5. **Set up alerts** (optional) - Cloudflare Email Workers for notifications
6. **Add to Notion documentation** - Document in Cloudflare Assets page

---

**Repository**: https://github.com/mkc909/ide-inbox-cron
**Documentation**: See README.md and SETUP.md for full details

**Last Updated**: December 26, 2025
