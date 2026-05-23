import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";

export const listCalendarsTool = tool(
    async () => {
        try {
            const calendar = await getCalendarClient();
            const response = await calendar.calendarList.list();
            const items = response.data.items || [];
            
            const calendars = items.map(item => ({
                id: item.id,
                summary: item.summary,
                primary: item.primary || false,
                role: item.accessRole,
            }));
            
            return JSON.stringify(calendars);
        } catch (error) {
            return `Error listing calendars: ${error.message}`;
        }
    },
    {
        name: "list_calendars",
        description: "List all calendars in the user's Google Calendar account, including secondary, birthday, and holiday calendars.",
        schema: z.object({}),
    }
);
