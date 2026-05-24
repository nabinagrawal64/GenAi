import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";
import { coerceStr } from "./zHelpers.js";

import { parseDateRange  } from "../utils/dateParser.js";

export const updateEventTool = tool(
    async ({ eventName: rawEventName, newDateText: rawNewDateText }) => {
        const eventName = coerceStr(rawEventName);
        const newDateText = coerceStr(rawNewDateText);
        try {
            const calendar = await getCalendarClient();

            // find event
            const response = await calendar.events.list({
                calendarId: "primary",
                q: eventName,
                singleEvents: true,
                orderBy: "startTime",
            });

            const events = response.data.items || [];
            if (events.length === 0) {
                return "No matching event found.";
            }

            const event = events[0];
            const parsedDate = parseDateRange(newDateText);
            if (!parsedDate) {
                return "Could not parse new date.";
            }

            const { start, end } = parsedDate;

            // patch event
            await calendar.events.patch({
                calendarId: "primary",
                eventId: event.id,
                requestBody: {
                    start: {
                        dateTime: start.toISOString(),
                        timeZone: "Asia/Kolkata",
                    },
                    end: {
                        dateTime: end.toISOString(),
                        timeZone: "Asia/Kolkata",
                    },
                },
            });

            return `
                Event updated successfully!

                ${event.summary}
            `;
        } catch (error) {
            console.log(error);
            return `Error: ${error.message}`;
        }
    },
    {
        name: "update_event",
        description: `
            Update existing Google Calendar event.
            Move events to new time/date.
        `,
        schema: z.object({
            eventName: z.any().describe("The name of the event to update/reschedule."),
            newDateText: z.any().describe("The new date/time description (e.g. 'tomorrow at 4pm')."),
        }),
    },
);
