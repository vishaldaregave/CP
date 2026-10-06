import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN || '',
});

async function main() {
    console.log("Starting Apify test scrape...");
    
    // minimal input
    const input = {
        query: "National Geographic",
        maxItems: 3
    };

    try {
        const run = await client.actor("bo5X18oGenWEV9vVo").call(input);
        console.log(`Run finished with ID: ${run.id}`);
        console.log(`Dataset ID: ${run.defaultDatasetId}`);
        
        if (run.defaultDatasetId) {
            const { items } = await client.dataset(run.defaultDatasetId).listItems();
            console.log("\n--- DATASET JSON ---");
            console.log(JSON.stringify(items, null, 2));
        }
    } catch (e) {
        console.error("Error during Apify run:", e);
    }
}

main();
