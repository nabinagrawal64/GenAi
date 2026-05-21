import readline from "readline/promises";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

// TOOL
async function webSearch({ query }) {
    console.log(`Searching: ${query}`);

    const response = await tvly.search(query, { max_results: 1 });
    const finalResult = response.results[0]?.content || "No result found.";
    return finalResult.slice(0, 500);
}

async function main() {

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const messages = [
        {
            role: "system",
            content: `
                You are a smart AI assistant.
                Use the webSearch tool whenever latest information is needed.

                After getting the tool result:
                - answer directly
                - do NOT call tools again
                - keep answers short and accurate

                current date and time: ${new Date().toUTCString()}
            `,
        },
    ];

    while (true) {

        const question = await rl.question("Ask a question: (type 'exit' to quit) ");

        if(question.toLowerCase() === "exit") {
            break;
        }

        messages.push({ role: "user", content: question });

        while (true) {
            // FIRST MODEL CALL
            const completion = await groq.chat.completions.create({
                model: "openai/gpt-oss-120b",
                temperature: 0,
                messages,
                reasoning_format: "hidden",

                tools: [
                    {
                        type: "function",
                        function: {
                            name: "webSearch",
                            description:
                                "Search the web for latest information",
                            parameters: {
                                type: "object",
                                properties: {
                                    query: {
                                        type: "string",
                                        description: "Search query",
                                    },
                                },
                                required: ["query"],
                            },
                        },
                    },
                ],

                tool_choice: "auto",
            });

            const assistantMessage = completion.choices[0].message;

            // add assistant tool call message
            messages.push({
                role: "assistant",
                content: assistantMessage.content || "",
                tool_calls: assistantMessage.tool_calls,
            });

            const toolCalls = assistantMessage.tool_calls;
            if (!toolCalls) {
                console.log(assistantMessage.content);
                break;
            }

            // EXECUTE TOOLS
            for (const tool of toolCalls) {
                const functionName = tool.function.name;
                const functionArgs = JSON.parse(tool.function.arguments);

                if (functionName === "webSearch") {
                    const toolResult = await webSearch(functionArgs);

                    // console.log("\nTool Result:\n");
                    // console.log(toolResult);

                    // send tool result back
                    messages.push({
                        role: "tool",
                        tool_call_id: tool.id,
                        name: functionName,
                        content: toolResult,
                    });
                }
            }

            // force final answer
            messages.push({
                role: "system",
                content:
                    "You now have the tool result. Give the final answer directly. Do not call any more tools.",
            });
        }
    }

    rl.close();
}

main();
