import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    logInfo(`Received ${topic} webhook for ${shop}`, { shop, topic });

    try {
        const current = payload.current as string[];
        if (session) {
            await db.session.update({   
                where: {
                    id: session.id
                },
                data: {
                    scope: current.toString(),
                },
            });
        }
    } catch (error) {
        logError(error as Error, { shop, topic, context: 'scopes_update' });
    }

    return new Response();
};
