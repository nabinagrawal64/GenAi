import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function main() {
    const chatCompletion = await getGroqChatCompletion();
    // Print the completion returned by the LLM.
    console.log(chatCompletion.choices[0]?.message?.content || "");
}

export async function getGroqChatCompletion() {
    return groq.chat.completions.create({
        // temperature: 0.2, 
        // top_p: 0.1, 
        // stop: ["\n"],
        // max_completion_tokens: 100,
        response_format: {
            type: "json_object",
        },
        messages: [
            {
                role: "system",
                content: `You are a data analysis API that performs sentiment analysis on respond only with JSON using this format:
                        {
                            "sentiment_analysis": {
                                "sentiment": "positive|negative|neutral",
                                "confidence_score": 0.95,
                                "key_phrases": [

                                    "phrase": "detected key phrase",
                                    "sentiment": "positive|negative|neutral"

                                ]
                            },
                                "summary": "One sentence summary of the overall sentiment",
                        }`,
            },
            {
                role: "user",
                content: "give a sample json response for the following text: I love the new design of your website, but the loading time is too long.",
            },
        ],
        model: "openai/gpt-oss-120b",
    });
}

main().catch((error) => {
    console.error("An error occurred:", error);
});
