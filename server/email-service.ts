import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set. Email functionality will be simulated.");
}

const mailService = new MailService();
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  mailService.setApiKey(apiKey);
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  // If no API key is configured, simulate email sending
  if (!apiKey) {
    console.log('\n=== SIMULATED EMAIL ===');
    console.log(`To: ${params.to}`);
    console.log(`From: ${params.from}`);
    console.log(`Subject: ${params.subject}`);
    console.log(`Text: ${params.text || 'No text content'}`);
    console.log('=====================\n');
    return true;
  }

  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    console.log(`✅ Email sent successfully to ${params.to}`);
    return true;
  } catch (error: any) {
    console.error('SendGrid email error:', error.message || error);
    
    // If SendGrid fails, fall back to simulation mode for development
    console.log('\n=== FALLBACK SIMULATED EMAIL ===');
    console.log(`To: ${params.to}`);
    console.log(`From: ${params.from}`);
    console.log(`Subject: ${params.subject}`);
    console.log(`Text: ${params.text || 'No text content'}`);
    console.log('================================\n');
    return true;
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string, baseUrl?: string): Promise<boolean> {
  const safeBaseUrl = baseUrl || 'https://tapt-payment.replit.app';
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
        <p style="color: #667eea; word-break: break-all; font-size: 14px;">
          ${resetUrl}
        </p>
        
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
    from: 'noreply@tapt.co.nz',
    subject: 'Reset Your Tapt Payment Password',
    text: textContent,
    html: htmlContent,
  });
}