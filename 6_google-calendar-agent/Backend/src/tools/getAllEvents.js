import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";

export const getAllEventsTool = tool(
    async ({ days = 30 }) => {
        try {
            const calendar = await getCalendarClient();

            // Fetch all calendars the user has
            const calendarList = await calendar.calendarList.list();
            const calendars = calendarList.data.items || [];

            let allEvents = [];

            const timeMin = new Date().toISOString();
            const timeMax = new Date(
                Date.now() + days * 24 * 60 * 60 * 1000
            ).toISOString();

            for (const cal of calendars) {
                try {
                    // FIX: was missing `await` — this was causing silent failures
                    const response = await calendar.events.list({
                        calendarId: cal.id,
                        timeMin,
                        timeMax,
                        singleEvents: true,
                        orderBy: "startTime",
                        maxResults: 50,
                    });

                    const events = response.data.items || [];

                    const formatted = events.map((event) => ({
                        id: event.id,
                        title: event.summary || "Untitled Event",
                        start: event.start?.dateTime || event.start?.date,
                        end: event.end?.dateTime || event.end?.date,
                        // Color info for visually-intelligent rendering
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

            // Sort all events chronologically
            allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

            if (allEvents.length === 0) {
                return `No events found in the next ${days} days across any calendar.`;
            }

            return JSON.stringify(allEvents);
        } catch (error) {
            console.log("GET ALL EVENTS ERROR:", error);
            return `Failed to fetch events: ${error.message}`;
        }
    },
    {
        name: "get_all_events",
        description: "Fetch all upcoming events from ALL calendars (primary, birthdays, holidays, reminders, shared, and secondary). Each event includes colorId and calendarColor for visual color-coding like Google Calendar. Use this when the user asks about everything on their calendar, or when searching a specific calendar type like birthdays or holidays.",
        schema: z.object({
            days: z.number().optional().describe("Number of days ahead to fetch events. Defaults to 30."),
        }),
    }
);
