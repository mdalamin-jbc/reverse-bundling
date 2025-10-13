// Email notification service
// Handles sending emails for bundle conversions, weekly summaries, and monthly reports

import { logInfo, logError } from "./logger.server";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

interface BundleDetectedEmailData {
  merchantEmail: string;
  merchantName: string;
  orderNumber: string;
  bundleName: string;
  bundledSku: string;
  savings: number;
  items: string[];
  appUrl: string;
}

interface WeeklySummaryEmailData {
  merchantEmail: string;
  merchantName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalConversions: number;
  totalSavings: number;
  topRule: {
    name: string;
    conversions: number;
    savings: number;
  } | null;
  appUrl: string;
}

interface MonthlyReportEmailData {
  merchantEmail: string;
  merchantName: string;
  month: string;
  year: number;
  totalConversions: number;
  totalSavings: number;
  avgSavingsPerOrder: number;
  topPerformingRules: Array<{
    name: string;
    conversions: number;
    savings: number;
  }>;
  appUrl: string;
}

// Email sending function (uses console.log for now - replace with real email service)
async function sendEmail({ to, subject, html, from }: EmailOptions) {
  try {
    // TODO: Replace with actual email service (SendGrid, AWS SES, Mailgun, etc.)
    // For now, just log the email content
    
    console.log('\n================== EMAIL ==================');
    console.log(`To: ${to}`);
    console.log(`From: ${from || 'noreply@reversebundlepro.com'}`);
    console.log(`Subject: ${subject}`);
    console.log('\n--- HTML Content ---');
    console.log(html);
    console.log('==========================================\n');

    logInfo('Email sent successfully', { to, subject });

    // Example integration with SendGrid (commented out):
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    await sgMail.send({
      to,
      from: from || 'noreply@reversebundlepro.com',
      subject,
      html,
    });
    */

    return { success: true };
  } catch (error) {
    logError(error as Error, { context: 'send_email', to, subject });
    return { success: false, error };
  }
}

// Email template helpers
function getEmailHeader(title: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .email-container {
          background: white;
          padding: 32px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 24px;
          border-radius: 8px;
          color: white;
          margin-bottom: 24px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          margin: 24px 0;
        }
        .metric {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 6px;
          margin: 12px 0;
          border-left: 4px solid #667eea;
        }
        .metric-value {
          font-size: 32px;
          font-weight: bold;
          color: #10b981;
          margin: 8px 0;
        }
        .button {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          margin: 16px 0;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          font-size: 14px;
          color: #6b7280;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        th {
          background: #f8f9fa;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>💰 ${title}</h1>
        </div>
        <div class="content">
  `;
}

function getEmailFooter(appUrl: string) {
  return `
        </div>
        <div class="footer">
          <p>
            <a href="${appUrl}" style="color: #667eea; text-decoration: none;">View in App</a> •
            <a href="${appUrl}/settings" style="color: #667eea; text-decoration: none;">Email Preferences</a>
          </p>
          <p>Reverse Bundle Pro - Automatic Order Bundling & Fulfillment Savings</p>
          <p style="font-size: 12px; color: #9ca3af;">
            You're receiving this email because you have email notifications enabled in your app settings.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// 1. Bundle Detected Email (sent immediately when bundle is detected)
export async function sendBundleDetectedEmail(data: BundleDetectedEmailData) {
  const { merchantEmail, merchantName, orderNumber, bundleName, bundledSku, savings, items, appUrl } = data;

  const html = `
    ${getEmailHeader('Bundle Detected! 🎉')}
    
    <p>Great news, ${merchantName}!</p>
    
    <p><strong>Order ${orderNumber}</strong> matched your bundle rule and was automatically converted!</p>
    
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Bundle Rule Matched</div>
      <div style="font-size: 20px; font-weight: bold; color: #667eea; margin: 4px 0;">
        ${bundleName}
      </div>
    </div>
    
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Converted To</div>
      <div style="font-size: 20px; font-weight: bold; color: #764ba2; margin: 4px 0;">
        ${bundledSku}
      </div>
    </div>
    
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Estimated Savings</div>
      <div class="metric-value">$${savings.toFixed(2)}</div>
    </div>
    
    <div style="background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 16px 0;">
      <strong>Items in Order:</strong>
      <ul style="margin: 8px 0; padding-left: 20px;">
        ${items.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
    
    <p>These items will now be shipped together as a single bundle, saving you on fulfillment costs! 📦</p>
    
    <a href="${appUrl}/orders" class="button">View Order Details →</a>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      💡 <strong>Tip:</strong> The more bundle rules you create, the more you save!
    </p>
    
    ${getEmailFooter(appUrl)}
  `;

  return sendEmail({
    to: merchantEmail,
    subject: `💰 Bundle Detected! Saved $${savings.toFixed(2)} on Order ${orderNumber}`,
    html,
  });
}

// 2. Weekly Summary Email (sent every Monday morning)
export async function sendWeeklySummaryEmail(data: WeeklySummaryEmailData) {
  const { merchantEmail, merchantName, weekStartDate, weekEndDate, totalConversions, totalSavings, topRule, appUrl } = data;

  const html = `
    ${getEmailHeader('Your Weekly Bundle Summary')}
    
    <p>Hi ${merchantName},</p>
    
    <p>Here's how your bundling performed this week (${weekStartDate} - ${weekEndDate}):</p>
    
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Orders Bundled</div>
      <div style="font-size: 32px; font-weight: bold; color: #667eea; margin: 8px 0;">
        ${totalConversions}
      </div>
    </div>
    
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Total Savings This Week</div>
      <div class="metric-value">$${totalSavings.toFixed(2)}</div>
    </div>
    
    ${topRule ? `
    <div style="background: #f0fdf4; padding: 16px; border-radius: 6px; border-left: 4px solid #10b981; margin: 16px 0;">
      <strong>🏆 Top Performing Rule:</strong>
      <div style="margin-top: 8px;">
        <div style="font-size: 18px; font-weight: bold; color: #059669;">${topRule.name}</div>
        <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">
          ${topRule.conversions} conversions • $${topRule.savings.toFixed(2)} saved
        </div>
      </div>
    </div>
    ` : '<p>No conversions this week yet. Make sure your bundle rules are active!</p>'}
    
    <a href="${appUrl}" class="button">View Full Dashboard →</a>
    
    <div style="background: #fffbeb; padding: 16px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 24px 0;">
      <strong>💡 Weekly Tip:</strong>
      <p style="margin: 8px 0 0 0;">
        ${totalConversions > 0 
          ? "Great job! Keep monitoring your top performing rules and consider creating similar ones."
          : "Create more bundle rules to start seeing savings! Look for products frequently bought together."
        }
      </p>
    </div>
    
    ${getEmailFooter(appUrl)}
  `;

  return sendEmail({
    to: merchantEmail,
    subject: `📊 Weekly Summary: ${totalConversions} orders bundled, $${totalSavings.toFixed(2)} saved`,
    html,
  });
}

// 3. Monthly Report Email (sent first day of each month)
export async function sendMonthlyReportEmail(data: MonthlyReportEmailData) {
  const { merchantEmail, merchantName, month, year, totalConversions, totalSavings, avgSavingsPerOrder, topPerformingRules, appUrl } = data;

  const html = `
    ${getEmailHeader(`${month} ${year} Performance Report`)}
    
    <p>Hi ${merchantName},</p>
    
    <p>Your monthly bundling report is ready! Here's a summary of your savings for ${month} ${year}:</p>
    
    <div style="display: grid; gap: 16px; margin: 24px 0;">
      <div class="metric">
        <div style="font-size: 14px; color: #6b7280;">Total Orders Bundled</div>
        <div style="font-size: 32px; font-weight: bold; color: #667eea; margin: 8px 0;">
          ${totalConversions}
        </div>
      </div>
      
      <div class="metric">
        <div style="font-size: 14px; color: #6b7280;">Total Savings</div>
        <div class="metric-value">$${totalSavings.toFixed(2)}</div>
      </div>
      
      <div class="metric">
        <div style="font-size: 14px; color: #6b7280;">Average Savings Per Order</div>
        <div style="font-size: 24px; font-weight: bold; color: #10b981; margin: 8px 0;">
          $${avgSavingsPerOrder.toFixed(2)}
        </div>
      </div>
    </div>
    
    ${topPerformingRules.length > 0 ? `
    <h2 style="color: #667eea; margin-top: 32px;">🏆 Top Performing Bundle Rules</h2>
    <table>
      <thead>
        <tr>
          <th>Bundle Rule</th>
          <th>Conversions</th>
          <th>Total Savings</th>
        </tr>
      </thead>
      <tbody>
        ${topPerformingRules.map(rule => `
          <tr>
            <td><strong>${rule.name}</strong></td>
            <td>${rule.conversions}</td>
            <td style="color: #10b981; font-weight: 600;">$${rule.savings.toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}
    
    <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); padding: 24px; border-radius: 8px; margin: 24px 0;">
      <h3 style="margin: 0 0 12px 0; color: #0369a1;">📈 Monthly ROI Analysis</h3>
      <p style="margin: 8px 0; font-size: 16px;">
        You saved <strong style="color: #10b981;">$${totalSavings.toFixed(2)}</strong> this month through automatic bundling.
      </p>
      <p style="margin: 8px 0; font-size: 14px; color: #6b7280;">
        That's an average of <strong>$${(totalSavings / 30).toFixed(2)} per day</strong> in reduced fulfillment costs!
      </p>
    </div>
    
    <a href="${appUrl}" class="button">View Detailed Report →</a>
    
    <div style="background: #fffbeb; padding: 16px; border-radius: 6px; border-left: 4px solid #f59e0b; margin: 24px 0;">
      <strong>💡 Optimization Tip:</strong>
      <p style="margin: 8px 0 0 0;">
        ${totalConversions > 50 
          ? "You're doing great! Consider analyzing which product combinations are most common and create more rules."
          : "To maximize savings, review your order history and identify products frequently bought together."
        }
      </p>
    </div>
    
    ${getEmailFooter(appUrl)}
  `;

  return sendEmail({
    to: merchantEmail,
    subject: `📊 ${month} Report: $${totalSavings.toFixed(2)} saved through automatic bundling`,
    html,
  });
}

// Helper function to get merchant's email from settings
export async function getMerchantEmailSettings(shop: string) {
  const db = (await import("./db.server")).default;
  
  const settings = await db.appSettings.findFirst({
    where: { shop },
  });

  return {
    emailEnabled: settings?.emailNotifications ?? true,
    weeklyEnabled: true, // Can add fields to AppSettings later
    monthlyEnabled: true, // Can add fields to AppSettings later
  };
}

export default {
  sendBundleDetectedEmail,
  sendWeeklySummaryEmail,
  sendMonthlyReportEmail,
  getMerchantEmailSettings,
};
