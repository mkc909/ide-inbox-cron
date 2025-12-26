/**
 * IDE Agent Inbox Cron Worker
 *
 * Cloudflare Worker that runs hourly to post tasks to IDE Agent Inbox via Notion API.
 * This enables sub-daily automated task routing since Notion agents only support daily minimum frequency.
 */

export interface Env {
  NOTION_API_TOKEN: string;
  IDE_INBOX_DB_ID: string;
  ENVIRONMENT?: string;
  // Optional: KV for task queue state
  TASK_QUEUE?: KVNamespace;
  // Optional: D1 for logging
  DB?: D1Database;
}

interface TaskPayload {
  title: string;
  description?: string;
  priority?: "High" | "Medium" | "Low";
  status?: string;
  tags?: string[];
}

interface NotionPage {
  parent: {
    database_id: string;
  };
  properties: {
    Name: {
      title: [
        {
          text: {
            content: string;
          };
        }
      ];
    };
    Description?: {
      rich_text: [
        {
          text: {
            content: string;
          };
        }
      ];
    };
    Priority?: {
      select: {
        name: string;
      };
    };
    Status?: {
      select: {
        name: string;
      };
    };
    Tags?: {
      multi_select: Array<{
        name: string;
      }>;
    };
  };
}

/**
 * Scheduled handler - called by cron trigger
 */
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] IDE Inbox Cron triggered`);

    try {
      // Step 1: Query or generate tasks
      const tasks = await getPendingTasks(env);

      console.log(`Found ${tasks.length} tasks to process`);

      if (tasks.length === 0) {
        console.log('No tasks to process, exiting');
        return;
      }

      // Step 2: Post each task to Notion
      const results = [];
      for (const task of tasks) {
        const result = await createNotionPage(env, task);
        results.push(result);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Step 3: Log results
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(`Cron completed: ${successCount} succeeded, ${failureCount} failed`);

      // Optional: Log to D1
      if (env.DB) {
        await logToD1(env, {
          timestamp,
          totalTasks: tasks.length,
          successCount,
          failureCount,
          results: JSON.stringify(results)
        });
      }

    } catch (error) {
      console.error('Cron execution failed:', error);

      // Log error to D1 if available
      if (env.DB) {
        await logErrorToD1(env, {
          timestamp,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }

      throw error;
    }
  },

  /**
   * HTTP handler - for manual testing and webhooks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return Response.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'ide-inbox-cron'
      });
    }

    // Manual trigger (for testing)
    if (path === '/trigger' && request.method === 'POST') {
      try {
        const body = await request.json() as { tasks?: TaskPayload[] };

        const tasks = body.tasks || await getPendingTasks(env);

        const results = [];
        for (const task of tasks) {
          const result = await createNotionPage(env, task);
          results.push(result);
        }

        return Response.json({
          success: true,
          message: `Processed ${tasks.length} tasks`,
          results
        });

      } catch (error) {
        return Response.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
      }
    }

    // Create single page (for quick testing)
    if (path === '/create' && request.method === 'POST') {
      try {
        const task = await request.json() as TaskPayload;
        const result = await createNotionPage(env, task);

        return Response.json(result);

      } catch (error) {
        return Response.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
      }
    }

    return Response.json({
      error: 'Not found',
      availableEndpoints: ['/health', '/trigger', '/create']
    }, { status: 404 });
  }
};

/**
 * Get pending tasks to process
 *
 * This can be extended to:
 * - Query from a database
 * - Generate from rules/templates
 * - Pull from a queue in KV
 */
async function getPendingTasks(env: Env): Promise<TaskPayload[]> {
  const tasks: TaskPayload[] = [];

  // Option 1: Generate from time-based rules
  const hour = new Date().getHours();

  // Morning tasks (6-11 AM)
  if (hour >= 6 && hour < 12) {
    tasks.push({
      title: 'Daily Code Review',
      description: `Review pull requests and code changes from ${new Date().toLocaleDateString()}`,
      priority: 'High',
      tags: ['review', 'daily']
    });
  }

  // Afternoon tasks (12-17 PM)
  if (hour >= 12 && hour < 18) {
    tasks.push({
      title: 'Integration Testing',
      description: 'Run integration tests and verify system health',
      priority: 'Medium',
      tags: ['testing', 'daily']
    });
  }

  // Evening tasks (18-23 PM)
  if (hour >= 18 && hour < 24) {
    tasks.push({
      title: 'Deployment Checklist',
      description: 'Verify staging environment and prepare deployment',
      priority: 'Low',
      tags: ['deployment', 'daily']
    });
  }

  // Option 2: Query from KV queue
  // const queuedTasks = await env.TASK_QUEUE?.get('pending_tasks');
  // if (queuedTasks) {
  //   const parsed = JSON.parse(queuedTasks) as TaskPayload[];
  //   tasks.push(...parsed);
  // }

  return tasks;
}

/**
 * Create a page in Notion database
 */
async function createNotionPage(env: Env, task: TaskPayload): Promise<{
  success: boolean;
  taskId: string;
  pageId?: string;
  error?: string;
}> {
  try {
    const notionPage = buildNotionPage(env.IDE_INBOX_DB_ID, task);

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.NOTION_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify(notionPage)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      taskId: task.title,
      pageId: data.id
    };

  } catch (error) {
    return {
      success: false,
      taskId: task.title,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Build Notion page object from task payload
 */
function buildNotionPage(databaseId: string, task: TaskPayload): NotionPage {
  const page: NotionPage = {
    parent: {
      database_id: databaseId
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: task.title
            }
          }
        ]
      }
    }
  };

  // Add description if provided
  if (task.description) {
    page.properties.Description = {
      rich_text: [
        {
          text: {
            content: task.description
          }
        }
      ]
    };
  }

  // Add priority if provided
  if (task.priority) {
    page.properties.Priority = {
      select: {
        name: task.priority
      }
    };
  }

  // Add status if provided (default to "Not Started")
  if (task.status) {
    page.properties.Status = {
      select: {
        name: task.status
      }
    };
  }

  // Add tags if provided
  if (task.tags && task.tags.length > 0) {
    page.properties.Tags = {
      multi_select: task.tags.map(tag => ({ name: tag }))
    };
  }

  return page;
}

/**
 * Log execution to D1 database
 */
async function logToD1(env: Env, data: {
  timestamp: string;
  totalTasks: number;
  successCount: number;
  failureCount: number;
  results: string;
}): Promise<void> {
  if (!env.DB) return;

  try {
    await env.DB.prepare(`
      INSERT INTO cron_logs (timestamp, total_tasks, success_count, failure_count, results)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.timestamp,
      data.totalTasks,
      data.successCount,
      data.failureCount,
      data.results
    ).run();
  } catch (error) {
    console.error('Failed to log to D1:', error);
  }
}

/**
 * Log error to D1 database
 */
async function logErrorToD1(env: Env, data: {
  timestamp: string;
  error: string;
  stack?: string;
}): Promise<void> {
  if (!env.DB) return;

  try {
    await env.DB.prepare(`
      INSERT INTO error_logs (timestamp, error_message, stack_trace)
      VALUES (?, ?, ?)
    `).bind(
      data.timestamp,
      data.error,
      data.stack || null
    ).run();
  } catch (error) {
    console.error('Failed to log error to D1:', error);
  }
}
