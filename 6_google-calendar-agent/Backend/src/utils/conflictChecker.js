export async function checkConflicts( calendar, start, end ) {

    const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
    });

    return response.data.items || [];
}