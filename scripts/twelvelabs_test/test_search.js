const { TwelveLabs } = require('twelvelabs-js');
require('dotenv').config();
const { setGlobalDispatcher, ProxyAgent } = require('undici');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Setup proxy for API requests in China
const proxyAgent = new ProxyAgent('http://127.0.0.1:7890');
setGlobalDispatcher(proxyAgent);

const API_KEY = process.env.TWELVELABS_API_KEY;
const client = new TwelveLabs({ apiKey: API_KEY });

const indexId = "6a0186aa6d4559b7dbebab72";

// Map video ID to local file
const videoIdToLocalFile = {
  "6a0186ad5d522693f2848b34": "video_1.mp4",
  "6a0186b6faa10fc6d20f19f7": "video_2.mp4",
  "6a0186d15d522693f2848b50": "video_3.mp4",
  "6a0186d95d522693f2848b62": "video_4.mp4",
  "6a0186db4e1c4f8de2c710a4": "video_5.mp4"
};

const TEMP_VIDEOS_DIR = path.join(__dirname, 'temp_videos');
const OUTPUT_CLIPS_DIR = path.join(__dirname, 'output_clips');

if (!fs.existsSync(OUTPUT_CLIPS_DIR)) {
  fs.mkdirSync(OUTPUT_CLIPS_DIR);
}


const TEST_QUERIES = [
  "Neo dodging bullets on a rooftop",
  "A spinning top on a wooden table",
  "A giant T-Rex roaring in the rain",
  "A man and a woman standing at the bow of a ship with arms stretched out",
  "A man saying he will make an offer"
];

async function runSearch() {
  console.log("\n--- Testing Natural Language Search ---");
  for (const testQuery of TEST_QUERIES) {
    console.log(`\nQuery: "${testQuery}"`);
    try {
      const searchResults = await client.search.query({
        indexId: indexId,
        queryText: testQuery,
        searchOptions: ["visual"]
      });

      if (searchResults.data && searchResults.data.length > 0) {
        console.log(`Top match found:`);
        const topResult = searchResults.data[0];
        console.log(`  Video ID: ${topResult.videoId}`);
        console.log(`  Time:     ${topResult.start}s - ${topResult.end}s`);
        
        const localFilename = videoIdToLocalFile[topResult.videoId];
        if (localFilename) {
          const inputFile = path.join(TEMP_VIDEOS_DIR, localFilename);
          // Cut a 3 second clip starting from the hit start time
          const duration = 3; 
          const safeQueryName = testQuery.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const outputFile = path.join(OUTPUT_CLIPS_DIR, `${safeQueryName}_clip.mp4`);
          
          console.log(`  Cutting 3s clip to: ${outputFile}`);
          // Use ffmpeg to cut: -ss [start] -i [input] -t [duration] -c copy [output]
          // -c copy is extremely fast as it just copies the stream, but might not be keyframe accurate.
          // For exact accuracy, we re-encode by omitting -c copy.
          const cmd = `ffmpeg -y -ss ${topResult.start} -i "${inputFile}" -t ${duration} "${outputFile}" -loglevel error`;
          try {
            execSync(cmd, { stdio: 'inherit' });
            console.log(`  -> Clip saved successfully.`);
          } catch (ffmpegErr) {
            console.error(`  -> FFmpeg failed: ${ffmpegErr.message}`);
          }
        } else {
            console.log(`  -> Could not map Video ID ${topResult.videoId} to a local file.`);
        }

      } else {
        console.log(`  No matches found.`);
      }
    } catch (err) {
      console.error(err);
    }
  }
  console.log("\nAll clips have been generated in the output_clips folder!");
}

runSearch();
