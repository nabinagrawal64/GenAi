export function coerceStr(val, fallback = "") {
    if (val === undefined || val === null) return fallback;
    if (typeof val === "object" && val !== null) {
        if ("value" in val) return String(val.value ?? fallback);
        return JSON.stringify(val);
    }
    return String(val);
}

export function coerceNum(val, fallback = 0) {
    if (val === undefined || val === null) return fallback;
    if (typeof val === "object" && val !== null) {
        if ("value" in val) val = val.value;
    }
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

export function coerceBool(val, fallback = false) {
    if (val === undefined || val === null) return fallback;
    if (typeof val === "object" && val !== null) {
        if ("value" in val) val = val.value;
    }
    if (typeof val === "string") {
        const s = val.trim().toLowerCase();
        if (s === "false" || s === "0" || s === "no" || s === "off") return false;
        if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
    }
    return Boolean(val);
}
