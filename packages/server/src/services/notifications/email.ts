import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { db } from '../../db/index';
import { companySettings } from '../../db/schema';
import { config } from '../../config';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface UserLike {
  id: number;
  name: string;
  email: string;
}

interface ProjectLike {
  id: number;
  name: string;
  clientName: string;
  bidDueDate?: string | null;
}

interface EstimateLike {
  id: number;
  name: string;
}

interface ChangeOrderLike {
  id: number;
  number: string;
  title: string;
  status: string;
}

// ── Transporter factory ───────────────────────────────────────────────────────

async function createTransporter(): Promise<{ transporter: Transporter; from: string } | null> {
  // First check DB settings
  try {
    const [settings] = await db.select().from(companySettings).limit(1);
    if (settings?.smtpHost && settings?.smtpUser && settings?.smtpFrom) {
      let password = '';
      if (settings.smtpPassEncrypted) {
        try {
          password = Buffer.from(settings.smtpPassEncrypted, 'base64').toString('utf8');
        } catch {
          password = settings.smtpPassEncrypted;
        }
      }

      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpSecure,
        auth: { user: settings.smtpUser, pass: password },
      });

      return { transporter, from: settings.smtpFrom };
    }
  } catch {
    // DB read failed – fall through to env vars
  }

  // Fall back to env vars
  if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_FROM) {
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
    return { transporter, from: config.SMTP_FROM };
  }

  return null;
}

// ── HTML template ─────────────────────────────────────────────────────────────

async function wrapHtml(body: string, companyName = 'OpenEstimate'): Promise<string> {
  let logoHtml = '';
  try {
    const [settings] = await db.select().from(companySettings).limit(1);
    if (settings?.logoUrl) {
      logoHtml = `<img src="${settings.logoUrl}" alt="${settings.companyName ?? companyName}" style="max-height:60px;margin-bottom:12px" />`;
      companyName = settings.companyName ?? companyName;
    }
  } catch { /* ignore */ }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${companyName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:24px 32px;text-align:center">
              ${logoHtml}
              <div style="color:#ffffff;font-size:20px;font-weight:bold">${companyName}</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0">
              <p style="margin:0;font-size:12px;color:#94a3b8">
                This email was sent by ${companyName} via OpenEstimate.<br/>
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Core send function ────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, html }: EmailPayload): Promise<void> {
  const transport = await createTransporter();

  if (!transport) {
    console.log(`Email not sent - SMTP not configured. Would have sent to: ${to}, subject: ${subject}`);
    return;
  }

  const wrappedHtml = html.includes('<!DOCTYPE html') ? html : await wrapHtml(html);

  await transport.transporter.sendMail({
    from: transport.from,
    to,
    subject,
    html: wrappedHtml,
  });
}

// ── Notification helpers ──────────────────────────────────────────────────────

export async function sendBidDueReminder(user: UserLike, project: ProjectLike, daysUntilDue: number): Promise<void> {
  const body = `
    <h2 style="color:#1e40af;margin-top:0">Bid Due Date Reminder</h2>
    <p>Hi ${user.name},</p>
    <p>This is a reminder that the bid for the following project is due in <strong>${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}</strong>:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold;width:40%">Project</td>
        <td style="padding:8px;background:#f8fafc">${project.name}</td>
      </tr>
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Client</td>
        <td style="padding:8px;background:#f8fafc">${project.clientName}</td>
      </tr>
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Bid Due Date</td>
        <td style="padding:8px;background:#f8fafc">${project.bidDueDate ? new Date(project.bidDueDate).toLocaleDateString() : 'N/A'}</td>
      </tr>
    </table>
    <p>Please make sure your estimate is complete and submitted on time.</p>
  `;

  await sendEmail({
    to: user.email,
    subject: `[OpenEstimate] Bid Due in ${daysUntilDue} Day${daysUntilDue !== 1 ? 's' : ''}: ${project.name}`,
    html: await wrapHtml(body),
  });
}

export async function sendChangeOrderNotification(user: UserLike, changeOrder: ChangeOrderLike, status: string): Promise<void> {
  const statusLabels: Record<string, string> = {
    submitted: 'Submitted for Review',
    approved: 'Approved',
    rejected: 'Rejected',
    draft: 'Updated',
  };

  const statusColors: Record<string, string> = {
    approved: '#16a34a',
    rejected: '#dc2626',
    submitted: '#2563eb',
    draft: '#64748b',
  };

  const label = statusLabels[status] ?? status;
  const color = statusColors[status] ?? '#64748b';

  const body = `
    <h2 style="color:#1e40af;margin-top:0">Change Order ${label}</h2>
    <p>Hi ${user.name},</p>
    <p>A change order has been updated:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold;width:40%">Number</td>
        <td style="padding:8px;background:#f8fafc">${changeOrder.number}</td>
      </tr>
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Title</td>
        <td style="padding:8px;background:#f8fafc">${changeOrder.title}</td>
      </tr>
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Status</td>
        <td style="padding:8px;background:#f8fafc"><span style="color:${color};font-weight:bold">${label}</span></td>
      </tr>
    </table>
    <p>Log in to OpenEstimate to view the full details.</p>
  `;

  await sendEmail({
    to: user.email,
    subject: `[OpenEstimate] Change Order ${changeOrder.number} ${label}`,
    html: await wrapHtml(body),
  });
}

export async function sendClientPortalNotification(user: UserLike, estimate: EstimateLike, action: string): Promise<void> {
  const isApproved = action === 'approve';
  const actionLabel = isApproved ? 'Approved' : 'Rejected';
  const color = isApproved ? '#16a34a' : '#dc2626';

  const body = `
    <h2 style="color:#1e40af;margin-top:0">Client ${actionLabel} Your Estimate</h2>
    <p>Hi ${user.name},</p>
    <p>Your client has <span style="color:${color};font-weight:bold">${actionLabel.toLowerCase()}</span> the following estimate:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold;width:40%">Estimate</td>
        <td style="padding:8px;background:#f8fafc">${estimate.name}</td>
      </tr>
    </table>
    <p>Log in to OpenEstimate to view the full details and next steps.</p>
  `;

  await sendEmail({
    to: user.email,
    subject: `[OpenEstimate] Client ${actionLabel} Estimate: ${estimate.name}`,
    html: await wrapHtml(body),
  });
}

export async function sendProjectAssignedNotification(user: UserLike, project: ProjectLike): Promise<void> {
  const body = `
    <h2 style="color:#1e40af;margin-top:0">You've Been Assigned to a Project</h2>
    <p>Hi ${user.name},</p>
    <p>You have been assigned to the following project:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold;width:40%">Project</td>
        <td style="padding:8px;background:#f8fafc">${project.name}</td>
      </tr>
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Client</td>
        <td style="padding:8px;background:#f8fafc">${project.clientName}</td>
      </tr>
      ${project.bidDueDate ? `
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Bid Due Date</td>
        <td style="padding:8px;background:#f8fafc">${new Date(project.bidDueDate).toLocaleDateString()}</td>
      </tr>` : ''}
    </table>
    <p>Log in to OpenEstimate to get started.</p>
  `;

  await sendEmail({
    to: user.email,
    subject: `[OpenEstimate] You've been assigned to: ${project.name}`,
    html: await wrapHtml(body),
  });
}

export async function sendPasswordResetEmail(user: UserLike, resetLink: string): Promise<void> {
  const body = `
    <h2 style="color:#1e40af;margin-top:0">Password Reset Request</h2>
    <p>Hi ${user.name},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <p style="text-align:center;margin:32px 0">
      <a href="${resetLink}"
         style="background:#1e40af;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
        Reset Password
      </a>
    </p>
    <p style="color:#64748b;font-size:13px">
      This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
    </p>
    <p style="color:#64748b;font-size:13px">
      Or copy this link into your browser:<br/>
      <a href="${resetLink}" style="color:#2563eb">${resetLink}</a>
    </p>
  `;

  await sendEmail({
    to: user.email,
    subject: '[OpenEstimate] Password Reset Request',
    html: await wrapHtml(body),
  });
}

export async function sendInviteEmail(user: UserLike, tempPassword: string): Promise<void> {
  const loginUrl = config.CLIENT_URL;

  const body = `
    <h2 style="color:#1e40af;margin-top:0">Welcome to OpenEstimate!</h2>
    <p>Hi ${user.name},</p>
    <p>You have been invited to use OpenEstimate, the construction estimating platform.</p>
    <p>Here are your login credentials:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold;width:40%">Email</td>
        <td style="padding:8px;background:#f8fafc">${user.email}</td>
      </tr>
      <tr>
        <td style="padding:8px;background:#f1f5f9;font-weight:bold">Temporary Password</td>
        <td style="padding:8px;background:#f8fafc;font-family:monospace;font-size:16px">${tempPassword}</td>
      </tr>
    </table>
    <p style="text-align:center;margin:32px 0">
      <a href="${loginUrl}/login"
         style="background:#1e40af;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
        Log In Now
      </a>
    </p>
    <p style="color:#ef4444;font-weight:bold">
      Important: Please change your password after your first login.
    </p>
  `;

  await sendEmail({
    to: user.email,
    subject: '[OpenEstimate] You have been invited',
    html: await wrapHtml(body),
  });
}
