import { Annotation } from "@langchain/langgraph";

export const LinkedInState = Annotation.Root({
    topic: Annotation({
        reducer: (_, value) => value,
        default: () => "",
    }),

    post: Annotation({
        reducer: (_, value) => value,
        default: () => "",
    }),

    critique: Annotation({
        reducer: (_, value) => value,
        default: () => "",
    }),

    iteration: Annotation({
        reducer: (_, value) => value,
        default: () => 0,
    }),
});
