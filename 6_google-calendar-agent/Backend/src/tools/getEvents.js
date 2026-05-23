import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";

export const getEventsTool = tool(
    async ({ calendarId = "primary", timeMin, timeMax, q, maxResults = 100 }) => {
        try {
            const calendar = await getCalendarClient();

            // Default timeMin to current time only if both timeMin and q are undefined.
            // This allows searching for specific events (like 'birthday') across past/future time ranges.
            let computedTimeMin = timeMin;
            if (!computedTimeMin && !q) {
                computedTimeMin = new Date().toISOString();
            }

            const params = {
                calendarId,
                maxResults,
                singleEvents: true,
                ...(q ? {} : { orderBy: "startTime" }), // Google API does not allow orderBy with query parameter q
                ...(computedTimeMin ? { timeMin: computedTimeMin } : {}),
                ...(timeMax ? { timeMax } : {}),
                ...(q ? { q } : {}),
            };

            const response = await calendar.events.list(params);
            const events = (response.data.items || []).map(event => ({
                id: event.id,
                summary: event.summary || "Untitled Event",
                start: event.start?.dateTime || event.start?.date,
                end: event.end?.dateTime || event.end?.date,
                ...(event.description ? { description: event.description } : {}),
                ...(event.location ? { location: event.location } : {}),
                ...(event.recurrence ? { recurrence: event.recurrence } : {}),
            }));
            return JSON.stringify(events);
        } catch (error) {
            return `Error fetching events: ${error.message}`;
        }
    },
    {
        name: "get_events",
        description: "Get calendar events with optional filtering by time range, search query, or calendar ID. Perfect for checking schedules or searching historical or future events (e.g. searching for 'birthday').",
        schema: z.object({
            calendarId: z.string().optional().describe("The calendar ID to search. Defaults to 'primary'."),
            timeMin: z.string().optional().describe("ISO string representing start of time range (e.g. '2026-05-23T00:00:00Z'). Use past dates to find historical events."),
            timeMax: z.string().optional().describe("ISO string representing end of time range."),
            q: z.string().optional().describe("Free-text query to search for events (e.g., 'birthday', 'meeting', 'dinner')."),
            maxResults: z.number().optional().describe("Maximum number of events to return. Defaults to 100."),
        }),
    },
);

