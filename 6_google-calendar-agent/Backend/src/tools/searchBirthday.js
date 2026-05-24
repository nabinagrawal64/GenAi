import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getCalendarClient } from "../services/googleAuth.js";
import { coerceStr } from "./zHelpers.js";

export const searchBirthdayTool = tool(
    async ({ name: rawName }) => {
        // Normalize — LLM may pass {type:"string",value:"Deban"} instead of "Deban"
        const name = coerceStr(rawName);
        if (!name) return "Please provide a person's name to search for their birthday.";

        try {
            const calendar = await getCalendarClient();

            const calListResponse = await calendar.calendarList.list();
            const allCalendars = calListResponse.data.items || [];

            // Prioritise birthday/contacts calendars
            const birthdayCalendars = allCalendars.filter(cal =>
                cal.summary?.toLowerCase().includes("birthday") ||
                cal.summary?.toLowerCase().includes("contact") ||
                cal.id?.toLowerCase().includes("birthday") ||
                cal.id?.toLowerCase().includes("contact")
            );

            const primaryCal = allCalendars.find(c => c.primary);
            const calendarsToSearch = [
                ...birthdayCalendars,
                ...(primaryCal && !birthdayCalendars.find(c => c.id === primaryCal.id) ? [primaryCal] : [])
            ];

            if (calendarsToSearch.length === 0) {
                calendarsToSearch.push(...allCalendars);
            }

            // Search by first name, last name, and full name separately
            const nameParts = name.trim().split(/\s+/);
            const queries = [...new Set([
                name.trim(),
                nameParts[0],
                nameParts[nameParts.length - 1],
            ])].filter(q => q.length > 1);

            // 1 year back, 2 years forward
            const timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
            const timeMax = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString();

            const found = new Map();

            for (const cal of calendarsToSearch) {
                for (const q of queries) {
                    try {
                        const response = await calendar.events.list({
                            calendarId: cal.id,
                            q,
                            timeMin,
                            timeMax,
                            singleEvents: true,
                            maxResults: 20,
                        });

                        for (const event of response.data.items || []) {
                            if (!event.id || found.has(event.id)) continue;
                            const title = (event.summary || "").toLowerCase();
                            if (title.includes(nameParts[0].toLowerCase()) ||
                                (nameParts[1] && title.includes(nameParts[1].toLowerCase()))) {
                                found.set(event.id, {
                                    title: event.summary,
                                    start: event.start?.dateTime || event.start?.date,
                                    end: event.end?.dateTime || event.end?.date,
                                    calendar: cal.summary,
                                    calendarType: "Birthday",
                                    colorId: event.colorId || "",
                                    calendarColor: cal.backgroundColor || "",
                                });
                            }
                        }
                    } catch { /* skip inaccessible calendars */ }
                }
            }

            const results = [...found.values()];

            if (results.length === 0) {
                return `No birthday found for "${name}" in your Google Calendar. The contact may not have a birthday saved.`;
            }

            results.sort((a, b) => new Date(a.start) - new Date(b.start));

            const today = new Date();
            const next = results.find(e => new Date(e.start) >= today) || results[results.length - 1];

            return JSON.stringify({
                name,
                nextBirthday: next,
                allOccurrencesFound: results.length,
            });

        } catch (error) {
            console.log("SEARCH BIRTHDAY ERROR:", error);
            return `Failed to search for birthday: ${error.message}`;
        }
    },
    {
        name: "search_birthday",
        description: "Search for a specific person's birthday across all Google Calendar birthday and contacts calendars. Searches by first name, last name, and full name separately. Returns only the NEXT upcoming birthday occurrence.",
        schema: z.object({
            name: z.any().describe("The person's name to search for (e.g., 'Amit Hota', 'Deben', 'Mom'). First name only or full name."),
        }),
    }
);
