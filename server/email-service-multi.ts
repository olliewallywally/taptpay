import { Resend } from 'resend';
import nodemailer from 'nodemailer';

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

const EMAIL_CONFIG = {
  provider: process.env.EMAIL_PROVIDER || 'resend',
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@taptpay.co.nz',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  gmail: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  outlook: {
    user: process.env.OUTLOOK_USER,
    pass: process.env.OUTLOOK_PASS,
  },
};

const resendClient = EMAIL_CONFIG.resend.apiKey
  ? new Resend(EMAIL_CONFIG.resend.apiKey)
  : null;

function createSmtpTransporter() {
  switch (EMAIL_CONFIG.provider) {
    case 'gmail':
      return nodemailer.createTransport({ service: 'gmail', auth: EMAIL_CONFIG.gmail });
    case 'outlook':
      return nodemailer.createTransport({ service: 'outlook', auth: EMAIL_CONFIG.outlook });
    case 'smtp':
      return nodemailer.createTransport(EMAIL_CONFIG.smtp);
    default:
      return null;
  }
}

async function sendWithResend(params: EmailParams): Promise<boolean> {
  if (!resendClient) {
    console.log('Resend not configured');
    return false;
  }
  try {
    const { error } = await resendClient.emails.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    if (error) {
      console.error('Resend email error:', error);
      return false;
    }
    console.log('✅ Email sent via Resend');
    return true;
  } catch (error) {
    console.error('Resend email exception:', error);
    return false;
  }
}

async function sendWithSmtp(params: EmailParams): Promise<boolean> {
  const transporter = createSmtpTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(`✅ Email sent via ${EMAIL_CONFIG.provider}`);
    return true;
  } catch (error) {
    console.error(`${EMAIL_CONFIG.provider} email error:`, error);
    return false;
  }
}

function simulateEmail(params: EmailParams): boolean {
  console.log('\n=== SIMULATED EMAIL ===');
  console.log(`To: ${params.to}`);
  console.log(`From: ${params.from}`);
  console.log(`Subject: ${params.subject}`);
  if (params.text) console.log(`Text: ${params.text.substring(0, 100)}...`);
  console.log('=====================\n');
  return true;
}

export async function sendEmailMulti(params: EmailParams): Promise<boolean> {
  console.log(`Sending email via ${EMAIL_CONFIG.provider}`);

  let success = false;

  if (EMAIL_CONFIG.provider === 'resend') {
    success = await sendWithResend(params);
  } else if (EMAIL_CONFIG.provider !== 'simulation') {
    success = await sendWithSmtp(params);
    // Resend as fallback
    if (!success && resendClient) {
      console.log('SMTP failed, falling back to Resend...');
      success = await sendWithResend(params);
    }
  }

  if (!success) {
    console.log('All providers failed, using simulation mode');
    success = simulateEmail(params);
  }

  return success;
}

export async function sendMerchantVerificationEmail(
  email: string,
  token: string,
  merchantName: string,
  baseUrl?: string
): Promise<boolean> {
  const properBaseUrl = baseUrl || (process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
    : 'http://localhost:5000');
  const confirmUrl = `${properBaseUrl}/confirm-email?token=${token}`;

  const html = `
    <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #060e42; padding: 32px 20px;">
      <div style="background-color: #0d1147; border: 1px solid rgba(255,255,255,0.08); padding: 40px 36px; border-radius: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <p style="font-size: 22px; font-weight: 700; color: #ffffff; margin: 0; letter-spacing: -0.5px;">TaptPay</p>
          <p style="color: rgba(255,255,255,0.5); margin: 6px 0 0 0; font-size: 14px;">Merchant Account Verification</p>
        </div>
        <p style="color: rgba(255,255,255,0.85); font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Hi ${merchantName},</p>
        <p style="color: rgba(255,255,255,0.65); font-size: 14px; line-height: 1.7; margin: 0 0 28px 0;">
          Thanks for signing up. Please confirm your email address to continue setting up your TaptPay merchant account.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${confirmUrl}"
             style="background-color: #00f1d7; color: #000a36; padding: 14px 36px; text-decoration: none; border-radius: 50px; display: inline-block; font-weight: 700; font-size: 15px; letter-spacing: 0.2px;">
            Confirm email address
          </a>
        </div>
        <p style="color: rgba(255,255,255,0.35); font-size: 12px; line-height: 1.6; margin: 28px 0 0 0; text-align: center;">
          If you didn't create a TaptPay account, you can safely ignore this email.
        </p>
        <p style="color: rgba(255,255,255,0.35); font-size: 12px; margin: 8px 0 0 0; text-align: center;">
          Need help? <a href="mailto:support@taptpay.co.nz" style="color: #00f1d7; text-decoration: none;">support@taptpay.co.nz</a>
        </p>
      </div>
    </div>
  `;

  const textContent = `Hi ${merchantName},

Please confirm your email address to continue setting up your TaptPay merchant account:

${confirmUrl}

If you didn't create a TaptPay account, ignore this email.

Need help? Contact us at support@taptpay.co.nz`;

  return sendEmailMulti({
    to: email,
    from: EMAIL_CONFIG.resend.fromEmail,
    subject: 'Confirm your TaptPay email address',
    html,
    text: textContent,
  });
}

export async function sendBoardBuilderEmail(params: {
  pdfBase64: string;
  businessName: string;
  submitterName: string;
  submitterEmail: string;
  stoneId: string;
  layout: string;
}): Promise<boolean> {
  const PRINT_TARGET = 'oliverleonard@taptpay.co.nz';
  const from = EMAIL_CONFIG.resend.fromEmail;

  const subject = `New Payment Board — ${params.businessName} (${params.layout})`;
  const html = `
    <h2>Payment Board Print Request</h2>
    <table style="border-collapse:collapse;width:100%;max-width:480px;">
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Business</td><td style="padding:6px 0;font-weight:600;">${params.businessName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Submitted by</td><td style="padding:6px 0;">${params.submitterName} &lt;${params.submitterEmail}&gt;</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Layout</td><td style="padding:6px 0;">${params.layout}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Stone / QR</td><td style="padding:6px 0;">${params.stoneId === 'main' ? 'Main Payment Link' : `Stone ID ${params.stoneId}`}</td></tr>
    </table>
    <p style="margin-top:16px;color:#374151;">The payment board PDF is attached to this email.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#9ca3af;font-size:12px;">Sent via TaptPay Board Builder</p>
  `;
  const filename = `payment-board-${params.businessName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`;

  // Try Resend first (supports attachments natively)
  if (resendClient) {
    try {
      const { error } = await resendClient.emails.send({
        to: PRINT_TARGET,
        from,
        subject,
        html,
        text: `Payment Board Print Request from ${params.businessName} submitted by ${params.submitterName}.`,
        attachments: [{
          filename,
          content: Buffer.from(params.pdfBase64, 'base64'),
        }],
      });
      if (!error) {
        console.log('✅ Board builder email sent via Resend');
        return true;
      }
      console.error('Resend board builder error:', error);
    } catch (err) {
      console.error('Resend board builder exception:', err);
    }
  }

  // SMTP fallback
  const transporter = createSmtpTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to: PRINT_TARGET,
        subject,
        html,
        attachments: [{
          filename,
          content: Buffer.from(params.pdfBase64, 'base64'),
          contentType: 'application/pdf',
        }],
      });
      console.log('✅ Board builder email sent via SMTP');
      return true;
    } catch (err) {
      console.error('SMTP board builder error:', err);
    }
  }

  console.log('[SIMULATED] Board builder email to', PRINT_TARGET, 'for', params.businessName);
  return true;
}

export function getEmailServiceStatus() {
  return {
    provider: EMAIL_CONFIG.provider,
    resendConfigured: !!EMAIL_CONFIG.resend.apiKey,
    smtpConfigured: !!(EMAIL_CONFIG.smtp.host && EMAIL_CONFIG.smtp.auth.user),
    gmailConfigured: !!(EMAIL_CONFIG.gmail.user && EMAIL_CONFIG.gmail.pass),
    outlookConfigured: !!(EMAIL_CONFIG.outlook.user && EMAIL_CONFIG.outlook.pass),
    availableProviders: [
      EMAIL_CONFIG.resend.apiKey ? 'resend' : null,
      EMAIL_CONFIG.gmail.user && EMAIL_CONFIG.gmail.pass ? 'gmail' : null,
      EMAIL_CONFIG.outlook.user && EMAIL_CONFIG.outlook.pass ? 'outlook' : null,
      EMAIL_CONFIG.smtp.host ? 'smtp' : null,
    ].filter(Boolean),
  };
}
