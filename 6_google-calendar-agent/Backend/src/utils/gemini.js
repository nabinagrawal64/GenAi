import { GoogleGenAI } from "@google/genai";
import * as wrappers from "langsmith/wrappers";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error("Missing Google Gemini API key. Set GOOGLE_API_KEY or GEMINI_API_KEY.");
}

const geminiClient = new GoogleGenAI({ apiKey });

export const client = wrappers.wrapSDK(geminiClient, {
    tracingExtra: {
        tags: ["calendar-agent"],
        metadata: {
            integration: "google-genai",
        },
    },
});
