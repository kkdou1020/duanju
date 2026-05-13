const { TwelveLabs } = require('twelvelabs-js');
const fs = require('fs');
const path = require('path');
const youtubedl = require('youtube-dl-exec');
require('dotenv').config();
const { setGlobalDispatcher, ProxyAgent } = require('undici');

// Setup proxy for API requests in China
const proxyAgent = new ProxyAgent('http://127.0.0.1:7890');
setGlobalDispatcher(proxyAgent);

const API_KEY = process.env.TWELVELABS_API_KEY;
if (!API_KEY) {
  console.error("Please set TWELVELABS_API_KEY in .env");
  process.exit(1);
}

const client = new TwelveLabs({ apiKey: API_KEY });

const TEMP_VIDEOS_DIR = path.join(__dirname, 'temp_videos');

const SEARCH_QUERIES = [
  "the matrix bullet time scene",
  "inception spinning top final scene",
  "jurassic park t-rex breakout scene",
  "titanic i'm flying jack scene",
  "the godfather i'm gonna make him an offer he can't refuse"
];

// Natural language queries to test against Twelve Labs
const TEST_QUERIES = [
  "Neo dodging bullets on a rooftop",
  "A spinning top on a wooden table",
  "A giant T-Rex roaring in the rain",
  "A man and a woman standing at the bow of a ship with arms stretched out",
  "A man saying he will make an offer"
];

async function downloadVideos() {
  if (!fs.existsSync(TEMP_VIDEOS_DIR)) {
    fs.mkdirSync(TEMP_VIDEOS_DIR);
  }

  console.log("Downloading 5 classic movie scenes...");
  const downloadedFiles = [];

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const query = SEARCH_QUERIES[i];
    const filename = `video_${i + 1}.mp4`;
    const outputPath = path.join(TEMP_VIDEOS_DIR, filename);

    if (fs.existsSync(outputPath)) {
      console.log(`[${i + 1}/5] ${filename} already exists. Skipping download.`);
      downloadedFiles.push(outputPath);
      continue;
    }

    console.log(`[${i + 1}/5] Searching and downloading: "${query}"...`);
    try {
      await youtubedl(`ytsearch1:${query}`, {
        output: outputPath,
        format: 'mp4',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
      });
      console.log(`  -> Downloaded to ${filename}`);
      downloadedFiles.push(outputPath);
    } catch (err) {
      console.error(`  -> Failed to download "${query}":`, err.message);
    }
  }
  return downloadedFiles;
}

async function runTwelveLabsTest() {
  try {
    const videoPaths = await downloadVideos();
    if (videoPaths.length === 0) {
      console.error("No videos downloaded. Exiting.");
      return;
    }

    console.log("\n--- Creating Twelve Labs Index ---");
    const indexName = `movie-test-index-${Date.now()}`;
    // Using current SDK syntax based on documentation
    const index = await client.indexes.create({
      indexName: indexName,
      models: [
        {
          modelName: "marengo3.0", 
          modelOptions: ["visual", "audio"]
        }
      ],
      addons: ["thumbnail"]
    });
    console.log(`Index created: ${indexName} (ID: ${index.id})`);

    console.log("\n--- Uploading Videos ---");
    const taskIds = [];
    for (const videoPath of videoPaths) {
      const filename = path.basename(videoPath);
      console.log(`Uploading ${filename}...`);
      const task = await client.tasks.create({
        indexId: index.id,
        videoFile: fs.createReadStream(videoPath)
      });
      taskIds.push(task.id);
      console.log(`  -> Task ID: ${task.id}`);
    }

    console.log("\n--- Waiting for Indexing to Complete ---");
    for (const taskId of taskIds) {
      console.log(`Waiting for task ${taskId}...`);
      await client.tasks.waitForDone(taskId, (status) => {
        // Only log status if it changes or we could just omit this to avoid spamming
      });
      console.log(`  -> Task ${taskId} finished successfully.`);
    }

    console.log("\n--- Testing Natural Language Search ---");
    for (const testQuery of TEST_QUERIES) {
      console.log(`\nQuery: "${testQuery}"`);
      const searchResults = await client.search.query({
        indexId: index.id,
        queryText: testQuery,
        searchOptions: ["visual"]
      });

      if (searchResults.data && searchResults.data.length > 0) {
        console.log(`Top match found:`);
        const topResult = searchResults.data[0];
        console.log(`  Video ID: ${topResult.videoId}`);
        console.log(`  Score:    ${topResult.score}`);
        console.log(`  Time:     ${topResult.start}s - ${topResult.end}s`);
      } else {
        console.log(`  No matches found.`);
      }
    }

    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error("An error occurred during the test:");
    console.error(error);
  }
}

runTwelveLabsTest();
