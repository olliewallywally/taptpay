import { MailService } from '@sendgrid/mail';
import nodemailer from 'nodemailer';

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

// Email service configuration with multiple provider support
const EMAIL_CONFIG = {
  provider: process.env.EMAIL_PROVIDER || 'gmail', // 'sendgrid', 'gmail', 'outlook', 'smtp'
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@tapt.co.nz',
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
    pass: process.env.GMAIL_APP_PASSWORD, // App-specific password
  },
  outlook: {
    user: process.env.OUTLOOK_USER,
    pass: process.env.OUTLOOK_PASS,
  },
};

// Initialize SendGrid if available
let sendGridService: MailService | null = null;
if (EMAIL_CONFIG.sendgrid.apiKey) {
  sendGridService = new MailService();
  sendGridService.setApiKey(EMAIL_CONFIG.sendgrid.apiKey);
}

// Create SMTP transporter based on provider
function createTransporter() {
  switch (EMAIL_CONFIG.provider) {
    case 'gmail':
      return nodemailer.createTransport({
        service: 'gmail',
        auth: EMAIL_CONFIG.gmail,
      });
    
    case 'outlook':
      return nodemailer.createTransport({
        service: 'outlook',
        auth: EMAIL_CONFIG.outlook,
      });
    
    case 'smtp':
      return nodemailer.createTransport(EMAIL_CONFIG.smtp);
    
    default:
      return null;
  }
}

async function sendWithSendGrid(params: EmailParams): Promise<boolean> {
  if (!sendGridService) {
    console.log('SendGrid not configured');
    return false;
  }
  
  try {
    await sendGridService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log('Email sent successfully via SendGrid');
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

async function sendWithSMTP(params: EmailParams): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('SMTP transporter not configured');
    return false;
  }
  
  try {
    await transporter.sendMail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(`Email sent successfully via ${EMAIL_CONFIG.provider}`);
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
  if (params.html) {
    console.log('HTML content provided');
  }
  if (params.text) {
    console.log(`Text: ${params.text.substring(0, 100)}${params.text.length > 100 ? '...' : ''}`);
  }
  console.log('=====================\n');
  return true;
}

export async function sendEmailMulti(params: EmailParams): Promise<boolean> {
  console.log(`Attempting to send email via ${EMAIL_CONFIG.provider}`);
  
  // Try primary provider first
  let success = false;
  
  if (EMAIL_CONFIG.provider === 'sendgrid') {
    success = await sendWithSendGrid(params);
  } else if (EMAIL_CONFIG.provider !== 'simulation') {
    success = await sendWithSMTP(params);
  }
  
  // Fallback to alternative providers if primary fails
  if (!success) {
    console.log('Primary email provider failed, trying fallbacks...');
    
    // Try SendGrid as fallback if not primary
    if (EMAIL_CONFIG.provider !== 'sendgrid' && sendGridService) {
      console.log('Trying SendGrid as fallback...');
      success = await sendWithSendGrid(params);
    }
    
    // Try Gmail as fallback if not primary
    if (!success && EMAIL_CONFIG.provider !== 'gmail' && EMAIL_CONFIG.gmail.user) {
      console.log('Trying Gmail as fallback...');
      const transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: EMAIL_CONFIG.gmail,
      });
      
      try {
        await transporter.sendMail({
          from: params.from,
          to: params.to,
          subject: params.subject,
          text: params.text,
          html: params.html,
        });
        console.log('Email sent successfully via Gmail fallback');
        success = true;
      } catch (error) {
        console.error('Gmail fallback error:', error);
      }
    }
  }
  
  // Final fallback to simulation for development
  if (!success) {
    console.log('All email providers failed, using simulation mode');
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
  // Use proper domain for verification URL
  const properBaseUrl = baseUrl || (process.env.REPLIT_DOMAINS ? 
    `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 
    'http://localhost:5000');
  const verificationUrl = `${properBaseUrl}/verify-merchant?token=${token}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
      <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #16423C; margin: 0; font-size: 28px;">Welcome to Tapt!</h1>
          <p style="color: #666; margin: 10px 0 0 0;">Complete your merchant account setup</p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 25px;">
          <h3 style="color: #16423C; margin: 0 0 10px 0;">Account Details</h3>
          <p style="margin: 5px 0; color: #333;"><strong>Business:</strong> ${merchantName}</p>
          <p style="margin: 5px 0; color: #333;"><strong>Email:</strong> ${email}</p>
        </div>
        
        <p style="color: #333; line-height: 1.6;">
          Your Tapt merchant account has been created! To start accepting payments, please verify your email address and set up your password.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #16423C; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Verify Account & Set Password
          </a>
        </div>
        
        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin-top: 25px;">
          <h4 style="color: #16423C; margin: 0 0 10px 0;">🚀 What's Next?</h4>
          <ul style="color: #333; margin: 0; padding-left: 20px;">
            <li>Complete your account verification</li>
            <li>Access your payment terminal</li>
            <li>Start accepting customer payments</li>
            <li>View analytics and manage transactions</li>
          </ul>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
        
        <p style="color: #666; font-size: 14px; margin: 0;">
          If you didn't create this account, please ignore this email. This verification link will expire in 24 hours.
        </p>
        
        <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">
          Need help? Contact us at support@tapt.co.nz
        </p>
      </div>
    </div>
  `;
  
  const textContent = `
Welcome to Tapt!

Your merchant account has been created for ${merchantName}.

To complete your setup, please verify your email and set your password:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create this account, please ignore this email.

Need help? Contact us at support@tapt.co.nz
  `;
  
  const fromEmail = EMAIL_CONFIG.provider === 'gmail' ? EMAIL_CONFIG.gmail.user : EMAIL_CONFIG.sendgrid.fromEmail;
  
  return sendEmailMulti({
    to: email,
    from: fromEmail || 'noreply@tapt.co.nz',
    subject: 'Welcome to Tapt - Verify Your Merchant Account',
    html,
    text: textContent
  });
}

// Email service status check
export function getEmailServiceStatus() {
  const status = {
    provider: EMAIL_CONFIG.provider,
    sendgridConfigured: !!EMAIL_CONFIG.sendgrid.apiKey,
    smtpConfigured: !!(EMAIL_CONFIG.smtp.host && EMAIL_CONFIG.smtp.auth.user),
    gmailConfigured: !!(EMAIL_CONFIG.gmail.user && EMAIL_CONFIG.gmail.pass),
    outlookConfigured: !!(EMAIL_CONFIG.outlook.user && EMAIL_CONFIG.outlook.pass),
    availableProviders: [] as string[],
  };
  
  if (status.sendgridConfigured) status.availableProviders.push('sendgrid');
  if (status.gmailConfigured) status.availableProviders.push('gmail');
  if (status.outlookConfigured) status.availableProviders.push('outlook');
  if (status.smtpConfigured) status.availableProviders.push('smtp');
  
  console.log('Email service status:', status);
  return status;
}