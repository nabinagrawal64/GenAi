import { StateGraph, START, END } from "@langchain/langgraph";

import { LinkedInState } from "./state.js";
import { writerNode } from "./nodes/writerNode.js";
import { critiqueNode } from "./nodes/critiqueNode.js";

function shouldContinue(state) {
    console.log(`Current Iteration: ${state.iteration}`);

    if (state.iteration >= 3) {
        console.log("Ending Graph");
        return END;
    }

    console.log("Looping Back To Writer");
    return "writerNode";
}

const graph = new StateGraph(LinkedInState)
    .addNode("writerNode", writerNode)
    .addNode("critiqueNode", critiqueNode)

    .addEdge(START, "writerNode")
    .addEdge("writerNode", "critiqueNode")

    .addConditionalEdges("critiqueNode", shouldContinue)

    .compile();

export default graph;


/**  
*  START
*    ↓
*  Writer
*    ↓
* Critique
*    ↓
* Condition
*    ┌───────┐
*    ↓       │
*  Writer    │
*    ↓       │
* Critique   │
*    ↓       │
*    └───────┘
*    ↓
*   END
*/