import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";
import { coerceStr } from "./zHelpers.js";

export const deleteEventTool = tool(
    async ({ eventName: rawEventName }) => {
        const eventName = coerceStr(rawEventName);
        try {
            const calendar = await getCalendarClient();

            // Find matching events
            const response = await calendar.events.list({
                calendarId: "primary",
                q: eventName,
                singleEvents: true,
                orderBy: "startTime",
                timeMin: new Date().toISOString(),
            });

            const events = response.data.items;
            if (!events || events.length === 0) {
                return `No event found with name "${eventName}"`;
            }

            // Take first matching event and Delete event
            const event = events[0];
            await calendar.events.delete({
                calendarId: "primary",
                eventId: event.id,
            });

            return `
                Event deleted successfully!

                Deleted:
                ${event.summary}
            `;
        } catch (error) {
            console.log("DELETE EVENT ERROR:");
            console.log(error);

            return `Error deleting event: ${error.message}`;
        }
    },
    {
        name: "delete_event",
        description: `
            Delete a Google Calendar event.

            Use this whenever user says:
            - delete meeting
            - cancel event
            - remove event
            - delete calendar event
        `,

        schema: z.object({
            eventName: z.any().describe("The name of the event to delete."),
        }),
    },
);
