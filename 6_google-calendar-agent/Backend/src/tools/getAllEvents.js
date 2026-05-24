import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";
import { coerceNum, coerceStr } from "./zHelpers.js";

export const getAllEventsTool = tool(
    async ({ days: rawDays, pastDays: rawPastDays, q: rawQ }) => {
        // Runtime coercion — LLM may pass strings or descriptor objects instead of plain values
        const days = coerceNum(rawDays, 30);
        const pastDays = coerceNum(rawPastDays, 365);
        const q = rawQ ? coerceStr(rawQ) : undefined;
        try {
            const calendar = await getCalendarClient();

            // Fetch all calendars the user has
            const calendarList = await calendar.calendarList.list();
            const calendars = calendarList.data.items || [];

            let allEvents = [];

            // Search back pastDays into the past AND forward `days` into the future
            // This is critical for birthdays — e.g., if birthday was Jan 1 and today is May,
            // we still need to find the Jan 1 event this year for context.
            const timeMin = new Date(Date.now() - pastDays * 24 * 60 * 60 * 1000).toISOString();
            const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

            for (const cal of calendars) {
                try {
                    const params = {
                        calendarId: cal.id,
                        timeMin,
                        timeMax,
                        singleEvents: true,
                        maxResults: 250,
                        // orderBy can only be used when q is absent
                        ...(q ? { q } : { orderBy: "startTime" }),
                    };

                    const response = await calendar.events.list(params);
                    const events = response.data.items || [];

                    const formatted = events.map((event) => ({
                        id: event.id,
                        title: event.summary || "Untitled Event",
                        start: event.start?.dateTime || event.start?.date,
                        end: event.end?.dateTime || event.end?.date,
                        // Color info for visual rendering
                        colorId: event.colorId || "",
                        calendarColor: cal.backgroundColor || "",
                        calendarForeground: cal.foregroundColor || "",
                        // Calendar metadata
                        calendar: cal.summary,
                        calendarId: cal.id,
                        calendarType: cal.primary
                            ? "Primary"
                            : cal.summary?.toLowerCase().includes("birthday")
                                ? "Birthday"
                                : cal.summary?.toLowerCase().includes("holiday")
                                    ? "Holiday"
                                    : "Secondary",
                        // Optional fields
                        ...(event.description ? { description: event.description } : {}),
                        ...(event.location ? { location: event.location } : {}),
                        ...(event.recurrence ? { recurrence: event.recurrence } : {}),
                    }));

                    allEvents.push(...formatted);
                } catch (err) {
                    // Skip calendars with permission issues without crashing
                    console.log(`Skipped calendar "${cal.summary}": ${err.message}`);
                }
            }

            // Sort chronologically
            allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

            if (allEvents.length === 0) {
                return q
                    ? `No events matching "${q}" found across any calendar.`
                    : `No events found across any calendar in the searched range.`;
            }

            return JSON.stringify(allEvents);
        } catch (error) {
            console.log("GET ALL EVENTS ERROR:", error);
            return `Failed to fetch events: ${error.message}`;
        }
    },
    {
        name: "get_all_events",
        description: "Fetch events from ALL calendars (primary, birthdays, holidays, reminders, shared, secondary). Searches both past and upcoming events. Each event includes colorId and calendarColor for visual color-coding. Use this for: birthdays, holidays, cross-calendar summaries, or when searching for a person's events across all calendars.",
        schema: z.object({
            days: z.any().optional().describe("Number of days AHEAD to search. Default 30. Use 365 for a full year ahead."),
            pastDays: z.any().optional().describe("Number of days INTO THE PAST to search. Default 365."),
            q: z.any().optional().describe("Optional keyword to filter events (e.g., 'Deben', 'birthday', 'meeting')."),
        }),
    }
);
