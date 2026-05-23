import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { savePreference } from "../services/firestoreMemory.js";

export const savePreferenceTool = tool(
    async ({ key, value }) => {
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
            key: z.string(),

            value: z.string(),
        }),
    },
);
