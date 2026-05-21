import { ChatGroq } from '@langchain/groq';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';
import readline from 'node:readline/promises';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { TavilySearch } from '@langchain/tavily';
import { MemorySaver } from '@langchain/langgraph';
import dotenv from 'dotenv';
import 'dotenv/config';

const checkpointer = new MemorySaver();

const tool = new TavilySearch({
    maxResults: 3,
    topic: 'general',
    // includeAnswer: false,
    // includeRawContent: false,
    // includeImages: false,
    // includeImageDescriptions: false,
    // searchDepth: "basic",
    // timeRange: "day",
    // includeDomains: [],
    // excludeDomains: [],
});

// Initialise the tool node
const tools = [tool];
const toolNode = new ToolNode(tools);

/**
 * 1. Define node function
 * 2. Build the graph
 * 3. Compile and invoke the graph
 */

// Initialise the LLM
const llm = new ChatGroq({
    model: 'openai/gpt-oss-120b',
    temperature: 0,
    maxRetries: 2,
}).bindTools(tools);

// call the LLM using APIs
async function callModel(state) {
    const response = await llm.invoke(state.messages);
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

// Build the graph
const workflow = new StateGraph(MessagesAnnotation)
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'agent')
    .addEdge('tools', 'agent')
    .addConditionalEdges('agent', shouldContinue);

// Compile the graph
const app = workflow.compile({ checkpointer });

async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {
        const userInput = await rl.question('You:');
        if (userInput === '/bye') break;

        const finalState = await app.invoke(
            { messages: [{ role: 'user', content: userInput }] },
            { configurable: { thread_id: '1' } }
        );

        const lastMessage = finalState.messages[finalState.messages.length - 1];
        console.log('AI:', lastMessage.content);
    }

    rl.close();
}

main();