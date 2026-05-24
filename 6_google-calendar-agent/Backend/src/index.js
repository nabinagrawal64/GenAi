import express from 'express';
import cors from 'cors';
import { ChatGroq } from '@langchain/groq';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

import { SYSTEM_PROMPT, GUEST_SYSTEM_PROMPT } from "./prompts/systemPrompt.js"
import { createEventTool } from "./tools/createEvent.js";
import { getEventsTool } from "./tools/getEvents.js";
import { deleteEventTool } from "./tools/deleteEvent.js";
import { updateEventTool } from "./tools/updateEventTool.js";
import { dailySummaryTool } from "./tools/dailySummary.js";
import { analyticsTool } from "./tools/analyticsTool.js";
import { savePreferenceTool } from "./tools/preferencesTool.js";
import { listCalendarsTool } from "./tools/listCalendars.js";
import { getAllEventsTool } from "./tools/getAllEvents.js";
import { searchBirthdayTool } from "./tools/searchBirthday.js";
import { searchEventTool } from "./tools/searchEvent.js";
import { generateTitleWithAI } from "./utils/generateTitleWithAI.js";
import { googleTokenContext } from "./services/googleAuth.js";
import {
    appendThreadMessages,
    appendThreadToolTraces,
    canPersistMessage,
    canPersistToolMessage,
    loadThreadMessages,
    loadThreadToolTraces,
    loadUserThreads,
    saveUserThreadMetadata,
    deleteUserThread,
} from "./services/firestoreMemory.js";

import dotenv from 'dotenv';
dotenv.config();

// Initialise the tool node
const tools = [
    createEventTool,
    getEventsTool,
    getAllEventsTool,
    searchBirthdayTool,
    searchEventTool,
    deleteEventTool,
    updateEventTool,
    dailySummaryTool,
    analyticsTool,
    savePreferenceTool,
    listCalendarsTool
];
const toolNode = new ToolNode(tools);

// Initialise the LLM (authenticated users — has calendar tools)
// llama-3.3-70b-versatile has reliable OpenAI-compatible structured tool calling on Groq.
const baseLlm = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    maxRetries: 2,
});

const llm = baseLlm.bindTools(tools);

// Guest LLM — no tools, uses GUEST_SYSTEM_PROMPT
const guestLlm = new ChatGroq({
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    maxRetries: 2,
});

// Regex to detect queries that MUST use a tool (date/event/calendar questions)
const DATE_EVENT_QUERY_RE = /when is|what date|which day|schedule|birthday|anniversary|holiday|festival|diwali|holi|eid|christmas|navratri|raksha|rakhi|puja|jayanti|event|remind|appointment|meeting|upcoming|today|tomorrow|this week|next week/i;

// call the LLM using APIs
async function callModel(state) {
    const currentDateTimeStr = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });

    const systemMessage = {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nActive System Context:\n- Current Time: ${currentDateTimeStr}\n- Current ISO Instant: ${new Date().toISOString()}`,
    };

    // Detect if this turn is a date/event question that has NOT yet
    // had a tool call in the current turn. In that case force tool_choice="required"
    // so the model cannot skip the tool and hallucinate from training data.
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    const lastContent = typeof lastMessage?.content === 'string' ? lastMessage.content : '';
    
    // Find the last human message to isolate the current turn's messages
    let lastHumanIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' || m.role === 'human' || m._getType?.() === 'human') {
            lastHumanIndex = i;
            break;
        }
    }
    
    let hasToolResultInCurrentTurn = false;
    if (lastHumanIndex !== -1) {
        const messagesSinceLastHuman = messages.slice(lastHumanIndex + 1);
        hasToolResultInCurrentTurn = messagesSinceLastHuman.some(
            m => m._getType?.() === 'tool' || m.role === 'tool'
        );
    }

    const isDateQuery = DATE_EVENT_QUERY_RE.test(lastContent);
    const shouldForceTool = isDateQuery && !hasToolResultInCurrentTurn && (lastMessage.role === 'user' || lastMessage.role === 'human' || lastMessage._getType?.() === 'human');

    const invokeLlm = shouldForceTool
        ? baseLlm.bindTools(tools, { tool_choice: 'any' })
        : llm;

    const response = await invokeLlm.invoke([
        systemMessage,
        ...messages,
    ]);
    return { messages: [response] };
}

// whether to call a tool or end
function shouldContinue(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage?.tool_calls?.length > 0) {
        return 'tools';
    }
    return '__end__';
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

// Build the graph
const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', shouldContinue);

// Compile the graph
const workflowApp = workflow.compile();

const app = express();
app.use(
    cors({
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        credentials: true,
    })
);

app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Backend running");
});

app.get('/chat/sessions', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        const sessions = await loadUserThreads(userId);
        res.json({ sessions });
    } catch (error) {
        console.error('Error fetching user sessions:', error);
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

app.post('/chat/sessions', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const { threadId, title } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        if (!threadId || !title) {
            return res.status(400).json({ error: 'threadId and title are required' });
        }
        await saveUserThreadMetadata(userId, threadId, title);
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving user session metadata:', error);
        res.status(500).json({ error: 'Failed to save session metadata' });
    }
});

app.delete('/chat/sessions/:threadId', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const { threadId } = req.params;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        await deleteUserThread(userId, threadId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user session:', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

app.get('/chat/history/:threadId', async (req, res) => {
    try {
        const { threadId } = req.params;
        const userId = req.headers['x-user-id'] || null;
        const history = await loadThreadMessages(threadId, userId);

        const formattedMessages = history
            .filter((message) => {
                if (message.role === 'user') {
                    return true;
                }

                if (message.role !== 'assistant') {
                    return false;
                }

                return hasVisibleContent(message.content);
            })
            .map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
            }));

        res.json({ messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.get('/chat/traces/:threadId', async (req, res) => {
    try {
        const { threadId } = req.params;
        const userId = req.headers['x-user-id'] || null;
        const traces = await loadThreadToolTraces(threadId, userId);

        const formattedTraces = traces.map((trace) => ({
            id: trace.id,
            role: trace.role,
            name: trace.name || null,
            content: trace.content,
            toolCallId: trace.toolCallId || null,
            sequence: trace.sequence,
            createdAt: trace.createdAt,
        }));

        res.json({ traces: formattedTraces });
    } catch (error) {
        console.error('Error fetching tool traces:', error);
        res.status(500).json({ error: 'Failed to fetch tool traces' });
    }
});

app.post('/chat/title', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const title = await generateTitleWithAI(message);
        res.json({ title });
    } catch (error) {
        console.error('Error generating chat title:', error);
        res.status(500).json({ error: 'Failed to generate chat title' });
    }
});

app.post('/chat', async (req, res) => {
    try {
        const { message, threadId = '1', previousMessages: guestMessages } = req.body;
        const userId = req.headers['x-user-id'] || null;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Guest: run a lightweight tool-free LLM — allows general chat but
        // instructs the AI to redirect calendar requests to sign-in.
        if (!userId) {
            const previousMessages = Array.isArray(guestMessages) ? guestMessages : [];
            const response = await guestLlm.invoke([
                { role: 'system', content: GUEST_SYSTEM_PROMPT },
                ...previousMessages.map((m) => ({ role: m.role, content: m.content })),
                { role: 'user', content: message },
            ]);
            return res.json({ reply: response.content });
        }

        // Authenticated: load persisted history from Firestore
        const previousMessages = await loadThreadMessages(threadId, userId);
        const persistedMessageCount = previousMessages.length;

        // Wrap the workflow in the user's Google token context so every
        // calendar tool call uses this specific user's OAuth credentials.
        const googleToken = req.headers['x-google-token'] || null;
        const finalState = await googleTokenContext.run(googleToken, () =>
            workflowApp.invoke(
                {
                    messages: [
                        ...previousMessages.map((entry) => ({
                            role: entry.role,
                            content: entry.content,
                            ...(entry.name ? { name: entry.name } : {}),
                            ...(entry.toolCallId ? { tool_call_id: entry.toolCallId } : {}),
                            ...(entry.toolCalls ? { tool_calls: entry.toolCalls } : {}),
                            ...(entry.additionalKwargs ? { additional_kwargs: entry.additionalKwargs } : {}),
                        })),
                        { role: 'user', content: message },
                    ],
                },
                { configurable: { thread_id: threadId } }
            )
        );

        const nextMessages = (finalState.messages || []).slice(persistedMessageCount);
        const messagesToPersist = nextMessages.filter(canPersistMessage);
        const toolMessagesToPersist = nextMessages.filter(canPersistToolMessage);

        if (messagesToPersist.length > 0) {
            await appendThreadMessages(threadId, messagesToPersist, userId);
        }

        if (toolMessagesToPersist.length > 0) {
            await appendThreadToolTraces(threadId, toolMessagesToPersist, userId);
        }

        const lastMessage = finalState.messages[finalState.messages.length - 1];

        res.json({
            reply: lastMessage.content,
        });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Failed to process chat' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


export default app;
