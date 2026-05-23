import fs from "fs/promises";
import os from "os";
import path from "path";
import process from "process";
import { AsyncLocalStorage } from "node:async_hooks";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// token.json stores the server-level OAuth refresh token (fallback for admin use).
// credentials.json / GOOGLE_CREDENTIALS_JSON stores the OAuth client credentials.
const TOKEN_PATH = path.join(process.cwd(), "token.json");

// Per-request async storage: stores the signed-in user's Google access token
export const googleTokenContext = new AsyncLocalStorage();

// ---------------------------------------------------------------------------
// Credentials helpers — read from GOOGLE_CREDENTIALS_JSON env var first,
// fall back to credentials.json file on disk.
// ---------------------------------------------------------------------------

function readCredentialsFromEnv() {
    const raw = process.env.GOOGLE_CREDENTIALS_JSON;
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        console.warn("Could not parse GOOGLE_CREDENTIALS_JSON. Falling back to credentials.json file.");
        return null;
    }
}

/**
 * Returns a file path to the credentials JSON that @google-cloud/local-auth
 * can use. If GOOGLE_CREDENTIALS_JSON is set we write it to a temp file so
 * we never need credentials.json on disk.
 */
async function resolveCredentialsPath() {
    const fromEnv = readCredentialsFromEnv();

    if (fromEnv) {
        const tempPath = path.join(os.tmpdir(), "google-credentials-temp.json");
        await fs.writeFile(tempPath, JSON.stringify(fromEnv));
        return tempPath;
    }

    // Fallback: credentials.json file
    const filePath = path.join(process.cwd(), "credentials.json");
    return filePath;
}

// ---------------------------------------------------------------------------
// Token helpers — read/write token.json for the server-level fallback account
// ---------------------------------------------------------------------------

async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch {
        return null;
    }
}

async function saveCredentials(client) {
    // Prefer env-var credentials, fall back to credentials.json
    const fromEnv = readCredentialsFromEnv();

    let clientId, clientSecret;

    if (fromEnv) {
        const key = fromEnv.installed || fromEnv.web;
        clientId = key.client_id;
        clientSecret = key.client_secret;
    } else {
        const content = await fs.readFile(path.join(process.cwd(), "credentials.json"));
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        clientId = key.client_id;
        clientSecret = key.client_secret;
    }

    const payload = JSON.stringify({
        type: "authorized_user",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: client.credentials.refresh_token,
    });

    await fs.writeFile(TOKEN_PATH, payload);
}

// Authenticate the server-level account (used only as a fallback)
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) return client;

    const credPath = await resolveCredentialsPath();
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: credPath,
    });

    if (client.credentials) {
        await saveCredentials(client);
    }

    return client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a Google Calendar client.
 * - If a per-request user token is set (via AsyncLocalStorage), uses that.
 * - Otherwise falls back to the server-level token stored in token.json.
 */
export async function getCalendarClient() {
    const userToken = googleTokenContext.getStore();

    if (userToken) {
        // Use the authenticated Firebase user's Google OAuth token
        const auth = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({ access_token: userToken });
        return google.calendar({ version: "v3", auth });
    }

    // Fallback: server-level token.json (admin / dev account)
    const auth = await authorize();
    return google.calendar({ version: "v3", auth });
}
