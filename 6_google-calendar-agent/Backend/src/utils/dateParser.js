import * as chrono from "chrono-node";

export function parseDateRange(dateText) {
    const results = chrono.parse(dateText);
    if (!results.length) {
        return null;
    }

    const result = results[0];
    const start = result.start.date();
    let end = null;

    // if end time provided
    if (result.end) {
        end = result.end.date();
    }

    // default 1 hour
    if (!end) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    return { start, end };
}
