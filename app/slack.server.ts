// Slack notification service
// Handles sending Slack notifications for bundle conversions

import { logInfo, logError } from "./logger.server";

interface SlackWebhookPayload {
  text?: string;
  blocks?: any[];
  attachments?: any[];
}

interface BundleDetectedSlackData {
  shop: string;
  orderNumber: string;
  bundleName: string;
  bundledSku: string;
  savings: number;
  items: string[];
  appUrl: string;
}

// Send Slack webhook notification
async function sendSlackWebhook(webhookUrl: string, payload: SlackWebhookPayload) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
    }

    logInfo('Slack notification sent successfully', { webhookUrl });
    return { success: true };
  } catch (error) {
    logError(error as Error, { context: 'send_slack_webhook', webhookUrl });
    return { success: false, error };
  }
}

// Send bundle detected notification to Slack
export async function sendBundleDetectedSlackNotification(data: BundleDetectedSlackData) {
  const { shop, orderNumber, bundleName, bundledSku, savings, items, appUrl } = data;

  // Get Slack webhook URL from settings
  const db = (await import("./db.server")).default;
  const settings = await db.appSettings.findFirst({
    where: { shop },
  });

  if (!settings?.slackWebhook || !settings.notificationsEnabled) {
    return { success: false, reason: 'Slack webhook not configured or notifications disabled' };
  }

  const payload: SlackWebhookPayload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "💰 Bundle Detected!"
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Order:* ${orderNumber}`
          },
          {
            type: "mrkdwn",
            text: `*Bundle:* ${bundleName}`
          },
          {
            type: "mrkdwn",
            text: `*Converted To:* ${bundledSku}`
          },
          {
            type: "mrkdwn",
            text: `*Savings:* $${savings.toFixed(2)}`
          }
        ]
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Items in Order:*\n${items.map(item => `• ${item}`).join('\n')}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "These items will now be shipped together as a single bundle, saving on fulfillment costs! 📦"
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Order"
            },
            url: `${appUrl}/orders`,
            style: "primary"
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Settings"
            },
            url: `${appUrl}/settings`
          }
        ]
      }
    ]
  };

  return sendSlackWebhook(settings.slackWebhook, payload);
}

// Test Slack webhook URL
export async function testSlackWebhook(webhookUrl: string) {
  const testPayload: SlackWebhookPayload = {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🧪 Slack Webhook Test"
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "✅ Your Slack webhook is working correctly!\n\nThis is a test message from Reverse Bundle Pro."
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Test sent at ${new Date().toLocaleString()}`
          }
        ]
      }
    ]
  };

  return sendSlackWebhook(webhookUrl, testPayload);
}

export default {
  sendBundleDetectedSlackNotification,
  testSlackWebhook,
};