import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";

export const listCalendarsTool = tool(
    async () => {
        try {
            const calendar = await getCalendarClient();
            const response = await calendar.calendarList.list();
            const items = response.data.items || [];

            if (!items.length) {
                return "No calendars found.";
            }

            const calendars = items.map((item) => ({
                id: item.id,
                summary: item.summary,
                primary: item.primary || false,
                role: item.accessRole,
                // Color info for visual rendering
                backgroundColor: item.backgroundColor || "",
                foregroundColor: item.foregroundColor || "",
                colorId: item.colorId || "",
                calendarType: item.primary
                    ? "Primary"
                    : item.summary?.toLowerCase().includes("birthday")
                        ? "Birthday"
                        : item.summary?.toLowerCase().includes("holiday")
                            ? "Holiday"
                            : "Secondary",
                ...(item.description ? { description: item.description } : {}),
                ...(item.timeZone ? { timeZone: item.timeZone } : {}),
            }));

            return JSON.stringify(calendars);
        } catch (error) {
            console.log("LIST CALENDARS ERROR:", error);
            return `Failed to list calendars: ${error.message}`;
        }
    },
    {
        name: "list_calendars",
        description: "List all Google Calendars available to the user (primary, birthday, holiday, shared, secondary). Returns each calendar's ID, name, color (backgroundColor/foregroundColor), and type. Use the returned calendarId to search events from a specific calendar.",
        schema: z.object({}),
    }
);