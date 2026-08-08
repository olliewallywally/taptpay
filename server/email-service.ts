import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

if (!resend) {
  console.warn("RESEND_API_KEY not set. Email functionality will be simulated.");
}

interface EmailAttachment {
  filename: string;
  content: Buffer | string;
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!resend) {
    // In production, never pretend a simulated email was delivered — that masks
    // a missing RESEND_API_KEY and makes "email sent" lies propagate to callers,
    // logs, and the admin test endpoint. Report the real failure instead.
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ RESEND_API_KEY not set — cannot send email "${params.subject}" to ${params.to}`);
      return false;
    }
    console.log('\n=== SIMULATED EMAIL (dev) ===');
    console.log(`To: ${params.to}`);
    console.log(`From: ${params.from}`);
    console.log(`Subject: ${params.subject}`);
    console.log(`Text: ${params.text || 'No text content'}`);
    if (params.attachments?.length) {
      console.log(`Attachments: ${params.attachments.map(a => a.filename).join(', ')}`);
    }
    console.log('=====================\n');
    return true;
  }

  try {
    const { error } = await resend.emails.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
      attachments: params.attachments,
    });
    if (error) {
      console.error('Resend email error:', error);
      return false;
    }
    console.log(`✅ Email sent successfully to ${params.to}`);
    return true;
  } catch (error: any) {
    console.error('Resend email error:', error?.message || error);
    return false;
  }
}

/** Merchant-supplied text reaches this email, so it must not carry markup. */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendTeamInviteEmail(params: {
  to: string;
  businessName: string;
  inviteUrl: string;
}): Promise<boolean> {
  const businessName = escapeHtml(params.businessName);
  const inviteUrl = params.inviteUrl;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #040D6D; padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">TaptPay</h1>
        <p style="color: #58ABFF; margin: 10px 0 0 0;">You've been added to a team</p>
      </div>
      <div style="padding: 40px 30px; background: white;">
        <h2 style="color: #333; margin-top: 0;">Set up your login</h2>
        <p style="color: #666; line-height: 1.6;">
          ${businessName} has given you a login on their TaptPay account.
          Choose a password to get started:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background: #040D6D; color: #58ABFF; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Accept invite
          </a>
        </div>
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="color: #040D6D; word-break: break-all; font-size: 14px;">${inviteUrl}</p>
        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            This invite expires in 7 days. If you weren't expecting it, you can ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;

  const textContent = `You've been added to a team on TaptPay

${params.businessName} has given you a login on their TaptPay account.

Set your password here:
${inviteUrl}

This invite expires in 7 days. If you weren't expecting it, you can ignore this email.

TaptPay Team
  `;

  return await sendEmail({
    to: params.to,
    from: 'noreply@taptpay.co.nz',
    // Newlines stripped: a subject header must stay on one line.
    subject: `You've been added to ${params.businessName.replace(/[\r\n]+/g, " ")} on TaptPay`,
    text: textContent,
    html: htmlContent,
  });
}

export async function sendSubscriptionPaymentFailedEmail(params: {
  to: string;
  businessName: string;
  planName: string;
  amount: string;
  nextRetryAt?: Date | null;
  suspended: boolean;
}): Promise<boolean> {
  const businessName = escapeHtml(params.businessName);
  const planName = escapeHtml(params.planName);
  const amount = escapeHtml(params.amount);
  const action = params.suspended
    ? "We have paused payment sending until you update your card in Settings."
    : params.nextRetryAt
      ? `We will try again on ${params.nextRetryAt.toLocaleDateString("en-NZ")}.`
      : "We will try the payment again automatically.";
  const safeAction = escapeHtml(action);

  return await sendEmail({
    to: params.to,
    from: "noreply@taptpay.co.nz",
    subject: params.suspended
      ? "Your TaptPay subscription is paused"
      : "Your TaptPay subscription payment failed",
    text: [
      `We could not collect ${params.amount} for ${params.businessName}'s ${params.planName} plan.`,
      action,
      "Update your payment method in TaptPay Settings.",
    ].join("\n\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#06102f">
        <h2>${params.suspended ? "Subscription paused" : "Payment unsuccessful"}</h2>
        <p>We could not collect <strong>${amount}</strong> for ${businessName}'s ${planName} plan.</p>
        <p>${safeAction}</p>
        <p>Please update your payment method in TaptPay Settings.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string, baseUrl?: string): Promise<boolean> {
  const safeBaseUrl = baseUrl || 'https://taptpay.co.nz';
  const resetUrl = `${safeBaseUrl}/reset-password?token=${resetToken}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Tapt Payment</h1>
        <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Password Reset Request</p>
      </div>
      <div style="padding: 40px 30px; background: white;">
        <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
        <p style="color: #666; line-height: 1.6;">
          We received a request to reset your password for your Tapt Payment account.
          Click the button below to create a new password:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; line-height: 1.6; font-size: 14px;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="color: #667eea; word-break: break-all; font-size: 14px;">${resetUrl}</p>
        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            This password reset link will expire in 1 hour. If you didn't request this reset, please ignore this email.
          </p>
        </div>
      </div>
    </div>
  `;

  const textContent = `
Password Reset Request - Tapt Payment

We received a request to reset your password for your Tapt Payment account.

To reset your password, visit this link:
${resetUrl}

This link will expire in 1 hour. If you didn't request this reset, please ignore this email.

Tapt Payment Team
  `;

  return await sendEmail({
    to: email,
    from: 'noreply@taptpay.co.nz',
    subject: 'Reset Your Tapt Payment Password',
    text: textContent,
    html: htmlContent,
  });
}
