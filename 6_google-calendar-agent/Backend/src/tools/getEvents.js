import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";

export const getEventsTool = tool(
    async () => {
        const calendar = await getCalendarClient();

        const response = await calendar.events.list({
            calendarId: "primary",
            maxResults: 10,
            singleEvents: true,
            orderBy: "startTime",
            timeMin: new Date().toISOString(),
        });

        return JSON.stringify(response.data.items);
    },
    {
        name: "get_events",
        description: "Get upcoming calendar events",
        schema: z.object({}),
    },
);
