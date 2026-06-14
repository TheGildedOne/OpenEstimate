import cron from 'node-cron';
import { db } from '../../db/index';
import {
  projects,
  notifications,
  notificationSettings,
  users,
  projectAssignees,
} from '../../db/schema';
import { eq, and, gte, lte, notInArray } from 'drizzle-orm';
import { sendBidDueReminder } from './email';

let scheduledTask: cron.ScheduledTask | null = null;

// ── Core check logic ──────────────────────────────────────────────────────────

async function checkBidDueDates(): Promise<void> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // We check for projects with bidDueDate in next 7 days (maximum reminder window)
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const dueSoonProjects = await db
    .select()
    .from(projects)
    .where(
      and(
        gte(projects.bidDueDate, today),
        lte(projects.bidDueDate, sevenDaysOut),
        notInArray(projects.status, ['won', 'lost', 'archived'])
      )
    );

  if (dueSoonProjects.length === 0) return;

  for (const project of dueSoonProjects) {
    if (!project.bidDueDate) continue;

    const dueDate = new Date(project.bidDueDate);
    const msUntilDue = dueDate.getTime() - now.getTime();
    const daysUntilDue = Math.ceil(msUntilDue / (1000 * 60 * 60 * 24));

    // Collect all users associated with this project: creator + assignees
    const assigneeRows = await db
      .select({ userId: projectAssignees.userId })
      .from(projectAssignees)
      .where(eq(projectAssignees.projectId, project.id));

    const userIds = new Set<number>([project.createdBy, ...assigneeRows.map((r) => r.userId)]);

    for (const userId of userIds) {
      // Get user's notification settings
      const [settings] = await db
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.userId, userId))
        .limit(1);

      // Parse reminder days (default [7, 3, 1])
      let reminderDays: number[] = [7, 3, 1];
      try {
        reminderDays = JSON.parse(settings?.bidDueReminderDaysJson ?? '[7,3,1]');
      } catch { /* use default */ }

      if (!reminderDays.includes(daysUntilDue)) continue;

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || !user.isActive) continue;

      const inAppEnabled = settings?.inAppEnabled ?? true;
      const emailEnabled = settings?.emailOnBidDue ?? true;

      const notifTitle = `Bid Due in ${daysUntilDue} Day${daysUntilDue !== 1 ? 's' : ''}`;
      const notifBody = `The bid for "${project.name}" (client: ${project.clientName}) is due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`} on ${new Date(project.bidDueDate).toLocaleDateString()}.`;

      // Create in-app notification
      if (inAppEnabled) {
        // Avoid duplicates: check if a notification with the same type/project/day was sent today
        const existingNotifs = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, userId),
              eq(notifications.type, 'bid_due_reminder'),
              gte(notifications.createdAt, today)
            )
          )
          .limit(1);

        if (existingNotifs.length === 0) {
          await db.insert(notifications).values({
            userId,
            type: 'bid_due_reminder',
            title: notifTitle,
            body: notifBody,
            link: `/projects/${project.id}`,
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Send email notification
      if (emailEnabled) {
        try {
          await sendBidDueReminder(user, project as never, daysUntilDue);
        } catch (err) {
          console.error(`Failed to send bid due reminder email to ${user.email}: ${(err as Error).message}`);
        }
      }
    }
  }
}

// ── Exported scheduler controls ───────────────────────────────────────────────

/**
 * Start the daily notification scheduler.
 * Runs every day at 8:00 AM server time.
 */
export function startScheduler(): void {
  if (scheduledTask) {
    console.log('[scheduler] Already running, skipping start');
    return;
  }

  // '0 8 * * *' = 8:00 AM every day
  scheduledTask = cron.schedule('0 8 * * *', async () => {
    console.log('[scheduler] Running bid due date check...');
    try {
      await checkBidDueDates();
      console.log('[scheduler] Bid due date check complete');
    } catch (err) {
      console.error('[scheduler] Bid due date check failed:', err);
    }
  });

  console.log('[scheduler] Bid due reminder scheduler started (runs daily at 8:00 AM)');
}

/**
 * Stop the scheduler gracefully.
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.destroy();
    scheduledTask = null;
    console.log('[scheduler] Scheduler stopped');
  }
}
