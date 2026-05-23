import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getCalendarClient } from "../services/googleAuth.js";

export const dailySummaryTool = tool(
    async () => {
        try {
            const calendar = await getCalendarClient();

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const response = await calendar.events.list({
                calendarId: "primary",
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: "startTime",
            });

            const events = response.data.items || [];
            if (!events.length) {
                return "You have no events today.";
            }

            let summary = "Today's Schedule:\n\n";

            events.forEach((event, index) => {
                const start = event.start?.dateTime || event.start?.date;
                summary += `
                    ${index + 1}. ${event.summary}
                    Time: ${new Date(start).toLocaleTimeString()}
                `;
            });

            return summary;
        } catch (error) {
            console.log(error);
            return `Error: ${error.message}`;
        }
    },
    {
        name: "daily_summary",
        description: `
            Get today's full schedule summary.
        `,
        schema: z.object({}),
    },
);
