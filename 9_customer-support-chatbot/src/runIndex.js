import { indexTheDocument } from './prepare.js';

async function main() {
    console.log("Starting index...");
    await indexTheDocument("selim_billing.pdf", "billing");
    await indexTheDocument("selim_marketing.pdf", "marketing");
    await indexTheDocument("selim_technical.pdf", "technical");
    await indexTheDocument("selim.ai_general.pdf", "general");
    console.log("All documents indexed!");
}

main();