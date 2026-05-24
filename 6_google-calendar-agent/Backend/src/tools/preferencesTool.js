import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { savePreference } from "../services/firestoreMemory.js";
import { coerceStr } from "./zHelpers.js";

export const savePreferenceTool = tool(
    async ({ key: rawKey, value: rawValue }) => {
        const key = coerceStr(rawKey);
        const value = coerceStr(rawValue);
        await savePreference(key, value);
        
        return `
            Preference saved:
            ${key} → ${value}
        `;
    },

    {
        name: "save_preference",
        description: `
            Save user preferences and habits.
        `,
        schema: z.object({
            key: z.any().describe("Preference key/name."),
            value: z.any().describe("Preference value to save."),
        }),
    },
);
