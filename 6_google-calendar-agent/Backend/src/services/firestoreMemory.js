import fs from 'node:fs';
import path from "path";
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const THREADS_COLLECTION = 'calendarAgentThreads';
const PREFERENCES_COLLECTION = 'calendarAgentPreferences';
const TOOL_TRACES_COLLECTION = 'calendarAgentToolTraces';

import dotenv from 'dotenv';
dotenv.config();

const localThreads = new Map();
const localPreferences = new Map();
let firestoreDb = null;

const defaultServiceAccountPath = path.join(process.cwd(), "service_account.json");

function stripUndefinedValues(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => stripUndefinedValues(item))
            .filter((item) => item !== undefined);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, nextValue]) => nextValue !== undefined)
                .map(([key, nextValue]) => [key, stripUndefinedValues(nextValue)])
                .filter(([, nextValue]) => nextValue !== undefined)
        );
    }

    return value;
}

function readServiceAccount() {
    const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (inlineJson) {
        try {
            return JSON.parse(inlineJson);
        } catch (error) {
            console.warn('Invalid FIREBASE_SERVICE_ACCOUNT_JSON value. Falling back to local memory.', error.message);
            return null;
        }
    }

    const serviceAccountFilePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        || defaultServiceAccountPath;

    if (!serviceAccountFilePath || !fs.existsSync(serviceAccountFilePath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(serviceAccountFilePath, 'utf8'));
    } catch (error) {
        console.warn('Unable to read Firebase service account file. Falling back to local memory.', error.message);
        return null;
    }
}

function initializeFirestore() {
    if (getApps().length > 0) {
        firestoreDb = getFirestore();
        firestoreDb.settings({ ignoreUndefinedProperties: true });
        return;
    }

    const serviceAccount = readServiceAccount();

    if (!serviceAccount) {
        console.warn('Firestore memory is disabled. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH to enable long-term memory.');
        return;
    }

    initializeApp({
        credential: cert(serviceAccount),
    });

    firestoreDb = getFirestore();
    firestoreDb.settings({ ignoreUndefinedProperties: true });
}

initializeFirestore();

function normalizeRole(message) {
    const role = message?._getType?.() || message?.role || message?.constructor?.name || 'assistant';

    if (role === 'human' || role === 'HumanMessage') {
        return 'user';
    }

    if (role === 'ai' || role === 'AIMessage') {
        return 'assistant';
    }

    if (role === 'tool' || role === 'ToolMessage') {
        return 'tool';
    }

    return role;
}

function toStoredMessage(message, sequence) {
    return stripUndefinedValues({
        id: message?.id || `${Date.now()}-${sequence}`,
        role: normalizeRole(message),
        content: message?.content,
        name: message?.name || null,
        toolCallId: message?.tool_call_id || message?.toolCallId || null,
        toolCalls: message?.tool_calls || message?.toolCalls || null,
        additionalKwargs: message?.additional_kwargs || message?.additionalKwargs || null,
        sequence,
        createdAt: Date.now(),
    });
}

export function canPersistMessage(message) {
    const role = normalizeRole(message);
    return role === 'user' || role === 'assistant';
}

export function canPersistToolMessage(message) {
    const role = normalizeRole(message);
    return role === 'tool';
}

function hasVisibleContent(content) {
    if (typeof content === 'string') {
        return content.trim().length > 0;
    }

    if (Array.isArray(content)) {
        return content.some((part) => {
            if (typeof part === 'string') {
                return part.trim().length > 0;
            }

            if (part && typeof part === 'object') {
                return String(part.text || part.content || '').trim().length > 0;
            }

            return false;
        });
    }

    return content !== null && content !== undefined && String(content).trim().length > 0;
}

function isReplayableTranscriptMessage(record) {
    return (record.role === 'user' || record.role === 'assistant') && hasVisibleContent(record.content);
}

function toPromptMessage(record) {
    const baseMessage = stripUndefinedValues({
        role: record.role,
        content: record.content,
    });

    if (record.name) {
        baseMessage.name = record.name;
    }

    return stripUndefinedValues(baseMessage);
}

async function loadThreadMessagesFromFirestore(threadId, userId) {
    const threadRef = firestoreDb.collection('calendarAgentUsers').doc(userId).collection('threads').doc(threadId);
    const snapshot = await threadRef.collection('messages').orderBy('sequence', 'asc').get();

    return snapshot.docs.map((doc) => doc.data());
}

async function appendThreadMessagesToFirestore(threadId, messages, userId) {
    const threadRef = firestoreDb.collection('calendarAgentUsers').doc(userId).collection('threads').doc(threadId);
    const threadSnapshot = await threadRef.get();
    const nextSequence = threadSnapshot.exists ? Number(threadSnapshot.data()?.nextSequence || 0) : 0;

    const batch = firestoreDb.batch();

    messages.forEach((message, index) => {
        const storedMessage = toStoredMessage(message, nextSequence + index);
        const messageRef = threadRef.collection('messages').doc(storedMessage.id);
        batch.set(messageRef, storedMessage, { merge: true });
    });

    batch.set(threadRef, {
        updatedAt: Date.now(),
        nextSequence: nextSequence + messages.length,
    }, { merge: true });

    await batch.commit();
}

async function appendToolTracesToFirestore(threadId, messages, userId) {
    const threadRef = firestoreDb.collection('calendarAgentUsers').doc(userId).collection('toolTraces').doc(threadId);
    const threadSnapshot = await threadRef.get();
    const nextSequence = threadSnapshot.exists ? Number(threadSnapshot.data()?.nextSequence || 0) : 0;

    const batch = firestoreDb.batch();

    messages.forEach((message, index) => {
        const storedMessage = toStoredMessage(message, nextSequence + index);
        const traceRef = threadRef.collection('messages').doc(storedMessage.id);
        batch.set(traceRef, storedMessage, { merge: true });
    });

    batch.set(threadRef, {
        updatedAt: Date.now(),
        nextSequence: nextSequence + messages.length,
    }, { merge: true });

    await batch.commit();
}

export async function loadThreadMessages(threadId, userId = null) {
    if (userId && firestoreDb) {
        const storedMessages = await loadThreadMessagesFromFirestore(threadId, userId);
        return storedMessages
            .filter(isReplayableTranscriptMessage)
            .map(toPromptMessage);
    }

    return (localThreads.get(threadId) || [])
        .filter(isReplayableTranscriptMessage)
        .map(toPromptMessage);
}

export async function appendThreadMessages(threadId, messages, userId = null) {
    if (!messages || messages.length === 0) {
        return;
    }

    if (userId && firestoreDb) {
        await appendThreadMessagesToFirestore(threadId, messages, userId);
        return;
    }

    const currentMessages = localThreads.get(threadId) || [];
    const nextSequence = currentMessages.length;
    const nextMessages = [
        ...currentMessages,
        ...messages.map((message, index) => toStoredMessage(message, nextSequence + index)),
    ];

    localThreads.set(threadId, nextMessages);
}

export async function appendThreadToolTraces(threadId, messages, userId = null) {
    if (!messages || messages.length === 0) {
        return;
    }

    if (userId && firestoreDb) {
        await appendToolTracesToFirestore(threadId, messages, userId);
        return;
    }

    const currentMessages = localThreads.get(`${threadId}:toolTraces`) || [];
    const nextSequence = currentMessages.length;
    const nextMessages = [
        ...currentMessages,
        ...messages.map((message, index) => toStoredMessage(message, nextSequence + index)),
    ];

    localThreads.set(`${threadId}:toolTraces`, nextMessages);
}

export async function loadThreadToolTraces(threadId, userId = null) {
    if (userId && firestoreDb) {
        const threadRef = firestoreDb.collection('calendarAgentUsers').doc(userId).collection('toolTraces').doc(threadId);
        const snapshot = await threadRef.collection('messages').orderBy('sequence', 'asc').get();

        return snapshot.docs.map((doc) => doc.data());
    }

    return localThreads.get(`${threadId}:toolTraces`) || [];
}

export async function loadUserThreads(userId) {
    if (userId && firestoreDb) {
        const snapshot = await firestoreDb
            .collection('calendarAgentUsers')
            .doc(userId)
            .collection('threads')
            .orderBy('updatedAt', 'desc')
            .get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));
    }
    return [];
}

export async function saveUserThreadMetadata(userId, threadId, title) {
    if (userId && firestoreDb) {
        const threadRef = firestoreDb
            .collection('calendarAgentUsers')
            .doc(userId)
            .collection('threads')
            .doc(threadId);
        
        await threadRef.set({
            id: threadId,
            title,
            updatedAt: Date.now()
        }, { merge: true });
    }
}

export async function deleteUserThread(userId, threadId) {
    if (userId && firestoreDb) {
        // Delete messages subcollection
        const threadRef = firestoreDb
            .collection('calendarAgentUsers')
            .doc(userId)
            .collection('threads')
            .doc(threadId);
        
        const messagesSnapshot = await threadRef.collection('messages').get();
        const batch = firestoreDb.batch();
        messagesSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        batch.delete(threadRef);

        // Delete toolTraces subcollection
        const traceRef = firestoreDb
            .collection('calendarAgentUsers')
            .doc(userId)
            .collection('toolTraces')
            .doc(threadId);
        const tracesSnapshot = await traceRef.collection('messages').get();
        tracesSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        batch.delete(traceRef);

        await batch.commit();
    }
}

export async function savePreference(key, value) {
    if (firestoreDb) {
        await firestoreDb.collection(PREFERENCES_COLLECTION).doc(key).set(stripUndefinedValues({
            key,
            value,
            updatedAt: Date.now(),
        }), { merge: true });
        return;
    }

    localPreferences.set(key, value);
}

export async function loadPreference(key) {
    if (firestoreDb) {
        const snapshot = await firestoreDb.collection(PREFERENCES_COLLECTION).doc(key).get();
        return snapshot.exists ? snapshot.data()?.value : null;
    }

    return localPreferences.has(key) ? localPreferences.get(key) : null;
}