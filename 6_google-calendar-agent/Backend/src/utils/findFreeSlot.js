export async function findNextFreeSlot(calendar, start) {
    let proposedStart = new Date(start);

    while (true) {
        const proposedEnd = new Date(proposedStart.getTime() + 60 * 60 * 1000);

        const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: proposedStart.toISOString(),
            timeMax: proposedEnd.toISOString(),
            singleEvents: true,
        });

        const conflicts = response.data.items || [];
        if (conflicts.length === 0) {
            return proposedStart;
        }

        proposedStart = new Date(proposedEnd.getTime() + 30 * 60 * 1000);
    }
}
