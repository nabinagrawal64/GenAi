import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";
import { coerceStr, coerceBool } from "./zHelpers.js";

export const searchEventTool = tool(
    async ({ query: rawQuery, returnAll: rawReturnAll }) => {
        // Normalize — LLM may pass {type:"string",value:"Diwali"} instead of "Diwali"
        const query = coerceStr(rawQuery);
        const returnAll = coerceBool(rawReturnAll, false);

        if (!query) return "Please provide an event name to search for.";

        try {
            const calendar = await getCalendarClient();

            const calListResponse = await calendar.calendarList.list();
            const allCalendars = calListResponse.data.items || [];

            if (!allCalendars.length) return "No calendars found in your account.";

            // Build query variations — full phrase + individual long words
            const words = query.trim().split(/\s+/).filter(w => w.length > 2);
            const queries = [...new Set([query.trim(), ...words])];

            // 1 year back, 2 years forward
            const timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
            const timeMax = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString();

            const found = new Map();

            for (const cal of allCalendars) {
                for (const q of queries) {
                    try {
                        const response = await calendar.events.list({
                            calendarId: cal.id,
                            q,
                            timeMin,
                            timeMax,
                            singleEvents: true,
                            maxResults: 30,
                        });

                        for (const event of response.data.items || []) {
                            if (!event.id || found.has(event.id)) continue;

                            const title = (event.summary || "").toLowerCase();
                            const isRelevant = words.some(w => title.includes(w.toLowerCase()))
                                || title.includes(query.toLowerCase());

                            if (!isRelevant) continue;

                            found.set(event.id, {
                                id: event.id,
                                title: event.summary || "Untitled",
                                start: event.start?.dateTime || event.start?.date,
                                end: event.end?.dateTime || event.end?.date,
                                calendar: cal.summary,
                                calendarType: cal.primary
                                    ? "Primary"
                                    : cal.summary?.toLowerCase().includes("birthday")
                                        ? "Birthday"
                                        : cal.summary?.toLowerCase().includes("holiday")
                                            ? "Holiday"
                                            : "Secondary",
                                colorId: event.colorId || "",
                                calendarColor: cal.backgroundColor || "",
                                ...(event.description ? { description: event.description } : {}),
                                ...(event.location ? { location: event.location } : {}),
                            });
                        }
                    } catch { /* skip inaccessible calendars */ }
                }
            }

            const results = [...found.values()];

            if (results.length === 0) {
                return `No events found matching "${query}" across any of your calendars. The event may not exist in your Google Calendar yet.`;
            }

            results.sort((a, b) => new Date(a.start) - new Date(b.start));

            if (returnAll) return JSON.stringify(results);

            // Return only the NEXT upcoming occurrence
            const today = new Date();
            const nextEvent = results.find(e => new Date(e.start) >= today)
                || results[results.length - 1];

            return JSON.stringify({
                query,
                nextOccurrence: nextEvent,
                totalFound: results.length,
            });

        } catch (error) {
            console.log("SEARCH EVENT ERROR:", error);
            return `Failed to search for "${query}": ${error.message}`;
        }
    },
    {
        name: "search_event",
        description: "Search for ANY event by name across ALL Google Calendar calendars (primary, holidays, birthdays, secondary). Works for festivals (Diwali, Holi, Raksha Bandhan, Eid), birthdays (person's name), meetings, anniversaries — anything. Returns the next upcoming occurrence by default.",
        schema: z.object({
            query: z.any().describe("The event name or person's name to search for. Examples: 'Diwali', 'Holi', 'Raksha Bandhan', 'Amit Hota'. Do NOT add 'birthday' when searching for a person."),
            returnAll: z.any().optional().describe("If true, returns ALL matching occurrences. Default is false (next occurrence only)."),
        }),
    }
);
