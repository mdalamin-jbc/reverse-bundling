import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { OrderAnalysisService } from "../order-analysis.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const analysisService = new OrderAnalysisService(admin, session.shop);
    const suggestions = await analysisService.generateBundleSuggestions();

    return json({
      success: true,
      suggestions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating bundle suggestions:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    const analysisService = new OrderAnalysisService(admin, session.shop);

    switch (action) {
      case "analyze-orders":
        const daysBack = parseInt(formData.get("daysBack") as string) || 90;
        await analysisService.analyzeOrderHistory(daysBack);
        return json({ success: true, message: "Order analysis completed" });

      case "generate-suggestions":
        const suggestions = await analysisService.generateBundleSuggestions();
        return json({ success: true, suggestions });

      case "clear-analysis":
        await analysisService.clearAnalysisData();
        return json({ success: true, message: "Analysis data cleared" });

      default:
        return json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in order analysis action:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};