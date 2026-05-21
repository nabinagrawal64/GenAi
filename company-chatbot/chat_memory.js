import Groq from 'groq-sdk';
import { tavily } from '@tavily/core';
import NodeCache from 'node-cache';
import { vectorStore } from './prepare.js';
import dotenv from 'dotenv';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

const cache = new NodeCache({ stdTTL: 60 * 60 * 24 });

export async function chat({ userMessage, threadId }) {
    const baseMessages = [
        {
            role: 'system',
            content: `You are a company assistant.
                    Use the conversation memory, the retrieved internal context, and web search when needed.
                    If the answer is in the retrieved context, prefer that context and answer using the exact policy details.
                    If you do not know the answer, say I don't know.
                    current date and time: ${new Date().toUTCString()}`,
        },
    ];

    const messages = cache.get(threadId) ?? [...baseMessages];

    messages.push({
        role: 'user',
        content: userMessage,
    });

    const MAX_RETRIES = 10;
    let count = 0;

    while (true) {
        if (count > MAX_RETRIES) {
            return 'I Could not find the result, please try again';
        }
        count++;

        const relevantChunks = await vectorStore.similaritySearch(userMessage, 5);
        const context = relevantChunks.map((chunk) => chunk.pageContent).join('\n\n');

        const promptMessages = [
            ...messages,
            {
                role: 'system',
                content: `Relevant internal context:\n${context || 'No relevant context found.'}`,
            },
        ];

        const completions = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 0,
            messages: promptMessages,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'webSearch',
                        description: 'Search the latest information and realtime data on the internet.',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'The search query to perform search on.',
                                },
                            },
                            required: ['query'],
                        },
                    },
                },
            ],
            tool_choice: 'auto',
        });

        messages.push(completions.choices[0].message);

        const toolCalls = completions.choices[0].message.tool_calls;

        if (!toolCalls) {
            cache.set(threadId, messages);
            return completions.choices[0].message.content;
        }

        for (const tool of toolCalls) {
            const functionName = tool.function.name;
            const functionParams = tool.function.arguments;

            if (functionName === 'webSearch') {
                const toolResult = await webSearch(JSON.parse(functionParams));

                messages.push({
                    tool_call_id: tool.id,
                    role: 'tool',
                    name: functionName,
                    content: toolResult,
                });
            }
        }
    }
}

async function webSearch({ query }) {
    console.log('Calling web search...');

    const response = await tvly.search(query);
    const finalResult = response.results.map((result) => result.content).join('\n\n');

    return finalResult;
}
