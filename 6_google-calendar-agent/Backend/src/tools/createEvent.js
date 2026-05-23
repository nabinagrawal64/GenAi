import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getCalendarClient } from "../services/googleAuth.js";
import { parseDateRange  } from "../utils/dateParser.js";
import { checkConflicts } from "../utils/conflictChecker.js";
import { findNextFreeSlot } from "../utils/findFreeSlot.js";
import { generateTitleWithAI  } from "../utils/generateTitleWithAI.js";

export const createEventTool = tool(
    async ({ summary, dateText, recurring }) => {
        try {
            const calendar = await getCalendarClient();

            const smartTitle = await generateTitleWithAI(summary);

            // parse natural language
            const parsedDate = parseDateRange(dateText);
            if (!parsedDate) {
                return "Could not understand the date.";
            }

            const { start, end } = parsedDate;

            // check conflicts
            const conflicts = await checkConflicts(calendar, start, end);

            // smart suggestion
            if (conflicts.length > 0) {
                const nextFreeSlot = await findNextFreeSlot(calendar, start);

                return `
                    You already have an event at that time.

                    Suggested free slot:
                    ${nextFreeSlot.toLocaleString()}
                `;
            }

            // recurring event support
            let recurrence = undefined;
            if (recurring) {
                recurrence = ["RRULE:FREQ=WEEKLY"];
            }

            const response = await calendar.events.insert({
                calendarId: "primary",
                requestBody: {
                    summary: smartTitle,
                    start: {
                        dateTime: start.toISOString(),
                        timeZone: "Asia/Kolkata",
                    },
                    end: {
                        dateTime: end.toISOString(),
                        timeZone: "Asia/Kolkata",
                    },

                    recurrence,
                },
            });

            return `
                Event created successfully!

                ${response.data.htmlLink}
            `;
        } catch (error) {
            console.log(error);
            return `Error: ${error.message}`;
        }
    },
    {
        name: "create_event",

        description: `
            Create a Google Calendar event.

            Supports:
            - scheduling
            - recurring events
            - smart suggestions
            - conflict detection
        `,

        schema: z.object({
            summary: z.string(),
            dateText: z.string(),
            recurring: z.boolean().optional(),
        }),
    },
);
