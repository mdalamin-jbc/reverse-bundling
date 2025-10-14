import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  ProgressBar,
  Banner,
  TextField,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../../shopify.server";
import db from "../../db.server";

const STEPS = [
  {
    id: 1,
    title: "Welcome to Reverse Bundle Pro",
    description: "Let's get you set up in just 5 minutes",
  },
  {
    id: 2,
    title: "Configure Your Settings",
    description: "Set up your preferences and automation rules",
  },
  {
    id: 3,
    title: "Create Your First Bundle Rule",
    description: "Define how orders should be automatically bundled",
  },
  {
    id: 4,
    title: "Review & Go Live",
    description: "Review your setup and start saving money",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const appSettings = await db.appSettings.findUnique({
    where: { shop: session.shop },
  });

  // If onboarding is completed, redirect to dashboard
  if (appSettings?.onboardingCompleted) {
    throw redirect('/app');
  }

  const currentStep = appSettings?.onboardingStep || 1;

  return json({
    currentStep,
    appSettings,
    shop: session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action") as string;

  const appSettings = await db.appSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  if (action === "next") {
    const nextStep = Math.min((appSettings.onboardingStep || 1) + 1, STEPS.length);

    await db.appSettings.update({
      where: { shop: session.shop },
      data: { onboardingStep: nextStep },
    });

    if (nextStep === STEPS.length) {
      // Mark onboarding as completed
      await db.appSettings.update({
        where: { shop: session.shop },
        data: { onboardingCompleted: true },
      });
      throw redirect('/app');
    }

    return json({ success: true, step: nextStep });
  }

  if (action === "previous") {
    const prevStep = Math.max((appSettings.onboardingStep || 1) - 1, 1);

    await db.appSettings.update({
      where: { shop: session.shop },
      data: { onboardingStep: prevStep },
    });

    return json({ success: true, step: prevStep });
  }

  if (action === "save-settings") {
    const notificationsEnabled = formData.get("notificationsEnabled") === "on";
    const emailNotifications = formData.get("emailNotifications") === "on";
    const autoConvertOrders = formData.get("autoConvertOrders") === "on";
    const minimumSavings = parseFloat(formData.get("minimumSavings") as string) || 0;

    await db.appSettings.update({
      where: { shop: session.shop },
      data: {
        notificationsEnabled,
        emailNotifications,
        autoConvertOrders,
        minimumSavings,
      },
    });

    return json({ success: true });
  }

  if (action === "create-rule") {
    const name = formData.get("name") as string;
    const items = formData.get("items") as string;
    const bundledSku = formData.get("bundledSku") as string;
    const savings = parseFloat(formData.get("savings") as string) || 0;

    if (name && items && bundledSku) {
      await db.bundleRule.create({
        data: {
          shop: session.shop,
          name,
          items: JSON.stringify(items.split(',').map(item => item.trim())),
          bundledSku,
          savings,
          status: "active",
        },
      });
    }

    return json({ success: true });
  }

  return json({ error: "Invalid action" });
};

export default function OnboardingWizard() {
  const { currentStep, appSettings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const currentStepData = STEPS.find(step => step.id === currentStep);
  const progress = (currentStep / STEPS.length) * 100;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card>
            <BlockStack gap="400">
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{
                  fontSize: '64px',
                  marginBottom: '24px',
                }}>
                  🚀
                </div>
                <Text as="h1" variant="heading2xl" fontWeight="bold">
                  Welcome to Reverse Bundle Pro!
                </Text>
                <Text as="p" variant="bodyLg" tone="subdued">
                  Transform individual product sales into profitable bundle conversions. Automatically detect and convert customer orders into your pre-configured bundle SKUs.
                </Text>
              </div>

              <BlockStack gap="300">
                <div style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  padding: '24px',
                  borderRadius: '8px',
                  color: 'white',
                }}>
                  <Text as="h3" variant="headingMd" fontWeight="semibold" tone="inherit">
                    What you'll accomplish in 5 minutes:
                  </Text>
                  <BlockStack gap="200">
                    <li>✅ Configure your app settings and preferences</li>
                    <li>✅ Create your first bundle rule with drag-and-drop</li>
                    <li>✅ Set up automatic order conversion</li>
                    <li>✅ Go live and start saving on fulfillment costs</li>
                  </BlockStack>
                </div>

                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    <strong>Pro tip:</strong> Bundle rules work 24/7, automatically converting orders that match your criteria. This can save you 15-35% on fulfillment costs!
                  </Text>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        );

      case 2:
        return (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Configure Your App Settings
              </Text>

              <Form method="post">
                <input type="hidden" name="action" value="save-settings" />

                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Notifications
                    </Text>
                    <Checkbox
                      label="Enable notifications for bundle conversions"
                      name="notificationsEnabled"
                    />
                    <Checkbox
                      label="Send email notifications"
                      name="emailNotifications"
                    />
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Automation Settings
                    </Text>
                    <Checkbox
                      label="Automatically convert orders to bundles"
                      name="autoConvertOrders"
                    />
                    <TextField
                      label="Minimum savings threshold ($)"
                      name="minimumSavings"
                      type="number"
                      autoComplete="off"
                      helpText="Only convert orders if savings exceed this amount"
                    />
                  </BlockStack>

                  <Button submit variant="primary">
                    Save Settings
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        );

      case 3:
        return (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                Create Your First Bundle Rule
              </Text>

              <Form method="post">
                <input type="hidden" name="action" value="create-rule" />

                <BlockStack gap="400">
                  <TextField
                    label="Bundle Rule Name"
                    name="name"
                    placeholder="e.g., Phone Accessories Bundle"
                    autoComplete="off"
                    helpText="Give your bundle rule a descriptive name"
                  />

                  <TextField
                    label="Individual Product SKUs"
                    name="items"
                    placeholder="PHONE-CASE-001, SCREEN-PROTECTOR-001, CHARGING-CABLE-001"
                    autoComplete="off"
                    helpText="Comma-separated list of SKUs that make up this bundle"
                  />

                  <TextField
                    label="Bundled Product SKU"
                    name="bundledSku"
                    placeholder="PHONE-ACCESSORIES-BUNDLE"
                    autoComplete="off"
                    helpText="The SKU of your pre-configured bundle product"
                  />

                  <TextField
                    label="Savings Amount ($)"
                    name="savings"
                    type="number"
                    step={0.01}
                    placeholder="15.99"
                    autoComplete="off"
                    helpText="How much money this bundle saves on fulfillment"
                  />

                  <Banner tone="info">
                    <Text as="p" variant="bodyMd">
                      <strong>How it works:</strong> When customers order all the individual SKUs listed above, their order will be automatically converted to use your bundle SKU instead, saving you on fulfillment costs.
                    </Text>
                  </Banner>

                  <Button submit variant="primary">
                    Create Bundle Rule
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        );

      case 4:
        return (
          <Card>
            <BlockStack gap="400">
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{
                  fontSize: '48px',
                  marginBottom: '16px',
                }}>
                  🎉
                </div>
                <Text as="h2" variant="headingLg" fontWeight="bold">
                  You're All Set!
                </Text>
                <Text as="p" variant="bodyLg" tone="subdued">
                  Your Reverse Bundle Pro setup is complete and ready to start saving money.
                </Text>
              </div>

              <BlockStack gap="300">
                <div style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  padding: '24px',
                  borderRadius: '8px',
                  color: 'white',
                }}>
                  <Text as="h3" variant="headingMd" fontWeight="semibold" tone="inherit">
                    What's Next:
                  </Text>
                  <BlockStack gap="200">
                    <li>📦 Orders will be automatically converted to bundles</li>
                    <li>💰 You'll save on fulfillment costs immediately</li>
                    <li>📊 Track performance in your dashboard</li>
                    <li>⚙️ Add more bundle rules as needed</li>
                  </BlockStack>
                </div>

                <Banner tone="success">
                  <Text as="p" variant="bodyMd">
                    <strong>Ready to go live?</strong> Click "Complete Setup" below to activate your bundle rules and start saving money!
                  </Text>
                </Banner>
              </BlockStack>
            </BlockStack>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <Page>
      <TitleBar title="Setup Wizard" />

      <BlockStack gap="400">
        {/* Progress Bar */}
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {currentStepData?.title}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Step {currentStep} of {STEPS.length}
              </Text>
            </InlineStack>
            <ProgressBar progress={progress} size="small" />
            <Text as="p" variant="bodySm" tone="subdued">
              {currentStepData?.description}
            </Text>
          </BlockStack>
        </Card>

        {/* Step Content */}
        {renderStepContent()}

        {/* Navigation */}
        <Card>
          <InlineStack align="space-between">
            <Button
              disabled={currentStep === 1}
              onClick={() => {
                const form = document.createElement('form');
                form.method = 'post';
                form.innerHTML = '<input type="hidden" name="action" value="previous" />';
                document.body.appendChild(form);
                form.submit();
              }}
            >
              Previous
            </Button>

            <Form method="post">
              <input type="hidden" name="action" value="next" />
              <Button
                submit
                variant={currentStep === STEPS.length ? "primary" : "secondary"}
              >
                {currentStep === STEPS.length ? "Complete Setup" : "Next"}
              </Button>
            </Form>
          </InlineStack>
        </Card>
      </BlockStack>
    </Page>
  );
}