import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getCalendarClient } from "../services/googleAuth.js";

export const analyticsTool = tool(
    async () => {
        try {
            const calendar = await getCalendarClient();

            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            const response = await calendar.events.list({
                calendarId: "primary",
                timeMin: weekAgo.toISOString(),
                timeMax: now.toISOString(),
                singleEvents: true,
            });

            const events = response.data.items || [];
            let totalHours = 0;
            events.forEach((event) => {
                if (event.start?.dateTime && event.end?.dateTime) {
                    const start = new Date(event.start.dateTime);

                    const end = new Date(event.end.dateTime);

                    totalHours += (end - start) / (1000 * 60 * 60);
                }
            });

            return `
                Calendar Analytics:

                Total Events:
                ${events.length}

                Total Scheduled Hours:
                ${totalHours.toFixed(2)} hours
            `;
        } catch (error) {
            console.log(error);
            return `Error: ${error.message}`;
        }
    },
    {
        name: "calendar_analytics",
        description: `
            Analyze user productivity and schedule.
        `,
        schema: z.object({}),
    },
);
