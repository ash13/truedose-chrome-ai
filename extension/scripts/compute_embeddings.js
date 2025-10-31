// scripts/compute_embeddings.js
// Usage:
//   OPENAI_API_KEY=sk-... node scripts/compute_embeddings.js
// Produces subreddits_with_embeddings.json in the project root.

import 'dotenv/config'; // add this line at the very top

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csvtojson';
import OpenAI from 'openai';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, '..', 'subreddit_database.csv');
const OUT_PATH = path.join(__dirname, '..', 'subreddits_with_embeddings.json');

// High-accuracy model per your choice:
const EMBED_MODEL = 'text-embedding-3-large';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

(async () => {
  // 1) Read CSV
  const rows = await csv().fromFile(CSV_PATH);

  // 2) Use ONLY the description field for embeddings
  const texts = rows.map(r => r.description || '');

  // 3) Batch embed
  const batches = chunk(texts, 100);
  const embeddings = [];

  for (const b of batches) {
    const resp = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: b
    });
    embeddings.push(...resp.data.map(o => o.embedding));
  }

  // 4) Build output
  const items = rows.map((r, i) => ({
    name: r.name,
    subscribers: Number(r.subscribers || 0),
    description: r.description || '',
    embedding: embeddings[i]
  }));

  // 5) Save JSON
  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify({ model: EMBED_MODEL, created: new Date().toISOString(), items }, null, 2)
  );

  console.log(`✅ Wrote ${items.length} subreddit embeddings to ${OUT_PATH}`);
})();

