// Email notification service
// Handles sending emails for bundle conversions, billing alerts, and reports

import nodemailer, { type Transporter } from "nodemailer";
import { logInfo, logError } from "./logger.server";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  listUnsubscribe?: string;
}

let brevoTransporter: Transporter | null | undefined;

function getDefaultFromAddress(): string {
  return process.env.EMAIL_FROM || "Reverse Bundle Pro <noreply@reverse-bundling.me>";
}

function getOutreachFromAddress(): string {
  return (
    process.env.OUTREACH_EMAIL_FROM ||
    "Md Alamin | Reverse Bundle Pro <noreply@reverse-bundling.me>"
  );
}

function getOutreachReplyTo(): string {
  return process.env.OUTREACH_REPLY_TO || "azurite.tech.ltd@gmail.com";
}

function isConfiguredSecret(value: string | undefined): value is string {
  if (!value) return false;
  const placeholder = value.toLowerCase();
  return !placeholder.startsWith("your_") && placeholder !== "changeme" && value.length > 8;
}

function getBrevoTransporter(): Transporter | null {
  if (brevoTransporter !== undefined) {
    return brevoTransporter;
  }

  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;

  if (!isConfiguredSecret(user) || !isConfiguredSecret(pass)) {
    brevoTransporter = null;
    return null;
  }

  brevoTransporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: parseInt(process.env.BREVO_SMTP_PORT || "2525", 10),
    secure: false,
    auth: { user, pass },
  });

  return brevoTransporter;
}

async function sendEmail({ to, subject, html, text, from, replyTo, listUnsubscribe }: EmailOptions) {
  const fromAddress = from || getDefaultFromAddress();

  try {
    const transporter = getBrevoTransporter();

    if (transporter) {
      const headers: Record<string, string> = {};
      if (listUnsubscribe) {
        headers["List-Unsubscribe"] = `<mailto:${listUnsubscribe}?subject=unsubscribe>`;
      }

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        replyTo: replyTo || undefined,
        subject,
        html,
        text,
        headers: Object.keys(headers).length ? headers : undefined,
      });

      logInfo("Email sent via Brevo SMTP", {
        to,
        subject,
        messageId: info.messageId,
      });

      return { success: true, provider: "brevo" as const };
    }

    console.log("\n================== EMAIL (dev log) ==================");
    console.log(`To: ${to}`);
    console.log(`From: ${fromAddress}`);
    console.log(`Subject: ${subject}`);
    console.log("\n--- HTML Content ---");
    console.log(html);
    console.log("=====================================================\n");

    logInfo("Email logged only — configure BREVO_SMTP_* to send for real", { to, subject });
    return { success: true, provider: "log" as const };
  } catch (error) {
    logError(error as Error, { context: "send_email", to, subject });
    return { success: false, error };
  }
}

export function isEmailDeliveryConfigured(): boolean {
  return getBrevoTransporter() !== null;
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

export type BillingAlertType =
  | "trial_80"
  | "trial_90"
  | "trial_exhausted"
  | "trial_expired"
  | "order_blocked";

interface BillingAlertEmailData {
  merchantEmail: string;
  merchantName: string;
  alertType: BillingAlertType;
  message: string;
  usageCount: number;
  planLimit: number;
  trialEndsAt: string | null;
  billingUrl: string;
  appUrl: string;
  orderName?: string;
}

interface OnboardingReminderEmailData {
  merchantEmail: string;
  merchantName: string;
  shopName: string;
  appUrl: string;
  setupUrl: string;
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

const billingAlertTitles: Record<BillingAlertType, string> = {
  trial_80: "Trial usage at 80%",
  trial_90: "Trial usage at 90%",
  trial_exhausted: "Trial conversion limit reached",
  trial_expired: "Your trial has ended",
  order_blocked: "Bundle conversion paused",
};

const billingAlertSubjects: Record<BillingAlertType, string> = {
  trial_80: "Reverse Bundle Pro: 80% of trial conversions used",
  trial_90: "Reverse Bundle Pro: 90% of trial conversions used — subscribe soon",
  trial_exhausted: "Reverse Bundle Pro: trial limit reached — subscribe to continue",
  trial_expired: "Reverse Bundle Pro: subscription required to keep converting orders",
  order_blocked: "Reverse Bundle Pro: an order was not converted — action required",
};

export async function sendBillingAlertEmail(data: BillingAlertEmailData) {
  const {
    merchantEmail,
    merchantName,
    alertType,
    message,
    usageCount,
    planLimit,
    trialEndsAt,
    billingUrl,
    appUrl,
    orderName,
  } = data;

  const title = billingAlertTitles[alertType];
  const limitLabel = planLimit === 999999 ? "Unlimited" : String(planLimit);

  const html = `
    ${getEmailHeader(title)}
    <p>Hi ${merchantName},</p>
    <p>${message}</p>
    ${orderName ? `<p><strong>Affected order:</strong> ${orderName}</p>` : ""}
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Current usage</div>
      <div style="font-size: 24px; font-weight: bold; color: #dc2626; margin: 4px 0;">
        ${usageCount} / ${limitLabel}
      </div>
    </div>
    ${
      trialEndsAt
        ? `<p style="font-size: 14px; color: #6b7280;">Trial end date: ${new Date(trialEndsAt).toLocaleDateString()}</p>`
        : ""
    }
    <p>To keep saving on shipping with automatic bundle conversions, choose a plan in Shopify billing.</p>
    <a href="${billingUrl}" class="button">Choose a plan →</a>
    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      You can also open the app and go to <strong>Billing</strong> any time.
    </p>
    ${getEmailFooter(appUrl)}
  `;

  return sendEmail({
    to: merchantEmail,
    subject: billingAlertSubjects[alertType],
    html,
  });
}

export async function sendOnboardingReminderEmail(data: OnboardingReminderEmailData) {
  const { merchantEmail, merchantName, shopName, appUrl, setupUrl } = data;

  const html = `
    ${getEmailHeader("Finish setup in 2 minutes")}
    <p>Hi ${merchantName},</p>
    <p>You installed <strong>Reverse Bundle Pro</strong> on <strong>${shopName}</strong>, but your first bundle rule is not active yet.</p>
    <p>Once you create one rule, the app automatically converts matching orders into a single bundled shipment — saving you money on every qualifying order.</p>
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">What to do now</div>
      <div style="font-size: 18px; font-weight: bold; color: #667eea; margin: 8px 0;">
        Open the app → Launch Setup Wizard → pick 2 products → go live
      </div>
    </div>
    <a href="${setupUrl}" class="button">Launch Setup Wizard →</a>
    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      Need help? Reply to this email or open the in-app tutorial from your Shopify admin.
    </p>
    ${getEmailFooter(appUrl)}
  `;

  return sendEmail({
    to: merchantEmail,
    subject: "Finish Reverse Bundle Pro setup — create your first bundle rule",
    html,
    replyTo: getOutreachReplyTo(),
  });
}

export type ProspectNiche = "supplements" | "beauty" | "accessories";

interface ProspectOutreachEmailData {
  prospectEmail: string;
  contactName: string;
  storeName: string;
  storeUrl: string;
  niche: ProspectNiche;
  hook?: string;
  appStoreUrl?: string;
}

function nicheContext(niche: ProspectNiche): { pain: string; example: string } {
  switch (niche) {
    case "supplements":
      return {
        pain: "customers often order multiple bottles or stack products in one cart",
        example: "protein + vitamins, or a starter stack shipped as one pre-packed unit",
      };
    case "beauty":
      return {
        pain: "kits and add-ons (serum + moisturizer + samples) ship as separate line items",
        example: "a routine bundle or gift set picked as one SKU instead of three",
      };
    case "accessories":
      return {
        pain: "phone cases, chargers, and screen protectors frequently ship together",
        example: "case + protector + cable converted to one bundle SKU before ShipStation",
      };
  }
}

function getOutreachEmailFooter(replyTo: string) {
  return `
        </div>
        <div class="footer">
          <p>
            <strong>NexusSell</strong> · Reverse Bundle Pro<br>
            Jessore, Bangladesh ·
            <a href="https://reverse-bundling.me/privacy-policy" style="color: #667eea;">Privacy</a>
          </p>
          <p style="font-size: 12px; color: #9ca3af;">
            You received this one-to-one note because your store fits our fulfillment automation focus.
            Reply <strong>unsubscribe</strong> to opt out of future messages.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function sendProspectOutreachEmail(data: ProspectOutreachEmailData) {
  const {
    prospectEmail,
    contactName,
    storeName,
    storeUrl,
    niche,
    hook,
    appStoreUrl = "https://apps.shopify.com/reverse-bundling",
  } = data;

  const replyTo = getOutreachReplyTo();
  const greeting = contactName && contactName !== "there" ? contactName : "there";
  const context = nicheContext(niche);
  const personalHook =
    hook ||
    `I noticed ${storeName} sells products where ${context.pain} — a great fit for reverse bundling.`;

  const subject = `Fulfillment idea for ${storeName} — bundle multi-SKU orders automatically`;

  const text = `Hi ${greeting},

${personalHook}

Reverse Bundle Pro is a Shopify app that converts matching multi-item orders into one pre-packed bundle SKU before fulfillment — so your team picks one unit instead of several (${context.example}).

What merchants use it for:
- Fewer picks and simpler labels on repeat product pairs
- Works with ShipStation / ShipBob via Shopify order sync
- 14-day trial with up to 25 conversions — then paid plans from $17.99/mo

Install (free trial): ${appStoreUrl}
Store: ${storeUrl}

Happy to set up your first bundle rule free in a 10-minute call — just reply to this email.

Best,
Md Alamin Haque
Founder, NexusSell · Reverse Bundle Pro
${replyTo}

Reply "unsubscribe" to opt out.`;

  const html = `
    ${getEmailHeader("A quick fulfillment idea")}
    <p>Hi ${greeting},</p>
    <p>${personalHook}</p>
    <p>
      <strong>Reverse Bundle Pro</strong> is a Shopify app that converts matching multi-item orders
      into one pre-packed bundle SKU <em>before</em> fulfillment — so your team picks one unit instead of several
      (${context.example}).
    </p>
    <div class="metric">
      <div style="font-size: 14px; color: #6b7280;">Why stores like yours use it</div>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>Fewer picks on orders that always ship together</li>
        <li>Cleaner handoff to ShipStation / ShipBob</li>
        <li>Dashboard tracks conversions and estimated savings</li>
      </ul>
    </div>
    <p>
      <strong>Trial:</strong> 14 days, up to 25 bundle conversions — then paid plans from $17.99/mo.
    </p>
    <a href="${appStoreUrl}" class="button">View on Shopify App Store →</a>
    <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
      If helpful, reply to this email and I’ll set up your first bundle rule free in about 10 minutes.
    </p>
    <p style="margin-top: 24px;">
      Best,<br>
      <strong>Md Alamin Haque</strong><br>
      Founder, NexusSell · Reverse Bundle Pro
    </p>
    ${getOutreachEmailFooter(replyTo)}
  `;

  return sendEmail({
    to: prospectEmail,
    subject,
    html,
    text,
    from: getOutreachFromAddress(),
    replyTo,
    listUnsubscribe: replyTo,
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
  sendBillingAlertEmail,
  sendOnboardingReminderEmail,
  sendProspectOutreachEmail,
  sendWeeklySummaryEmail,
  sendMonthlyReportEmail,
  getMerchantEmailSettings,
  isEmailDeliveryConfigured,
};
