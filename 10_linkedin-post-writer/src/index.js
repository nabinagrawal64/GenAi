import graph from "./graph.js";
import dotenv from "dotenv";
dotenv.config();

const result = await graph.invoke({
    topic: "Why every developer should learn AI in 2026",
});

console.log(result.post);
