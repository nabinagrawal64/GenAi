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
import 'dotenv/config';

// Initialise the tool node
const tools = [
    createEventTool, 
    getEventsTool, 
    deleteEventTool, 
    updateEventTool, 
    dailySummaryTool, 
    analyticsTool, 
    savePreferenceTool
];
const toolNode = new ToolNode(tools);

// Initialise the LLM (authenticated users — has calendar tools)
const llm = new ChatGroq({
    model: 'openai/gpt-oss-120b',
    temperature: 0,
    maxRetries: 2,
}).bindTools(tools);

// Guest LLM — no tools, uses GUEST_SYSTEM_PROMPT
const guestLlm = new ChatGroq({
    model: 'openai/gpt-oss-120b',
    temperature: 0,
    maxRetries: 2,
});

// call the LLM using APIs
async function callModel(state) {
    const response = await llm.invoke([
        {
            role: "system",
            content: SYSTEM_PROMPT,
        },
        ...state.messages,
    ]);
    return { messages: [response] };
}

// whether to call a tool or end
function shouldContinue(state) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.tool_calls.length > 0) {
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
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
