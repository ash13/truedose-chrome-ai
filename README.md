# Health Fact Checker Chrome Extension

## Installation Instructions

1. **Download all files** to a folder called `health-fact-checker`

2. **Create placeholder icons** (or skip for now):
   - You need three icon files: icon16.png, icon48.png, icon128.png
   - For now, you can use any small image files renamed to these names
   - Or create simple icons at https://www.canva.com

3. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select your `health-fact-checker` folder

4. **Enable Chrome AI** (REQUIRED):
   - Go to `chrome://flags/`
   - Search for "Prompt API for Gemini Nano"
   - Enable it
   - Search for "Optimization Guide On Device Model"
   - Set to "Enabled BypassPerfRequirement"
   - **Restart Chrome**
   - Go to `chrome://components/`
   - Find "Optimization Guide On Device Model" 
   - Click "Check for update"
   - Wait for download to complete (may take 5-10 minutes)

5. **Test it**:
   - Click the extension icon in Chrome
   - Enter a health claim
   - Click "Check This Claim"

## Features

- ✅ Fact-check health claims using Chrome's built-in AI
- ✅ Right-click context menu on selected text
- ✅ Clean, simple interface
- ✅ Works offline (once AI model is downloaded)

## Next Steps

- Add PubMed API integration
- Improve UI/styling
- Add source citations
- Save fact-check history
- Add more robust error handling

## Troubleshooting

**"Chrome AI not available" error:**
- Make sure you've enabled the flags in chrome://flags
- Verify the AI model downloaded in chrome://components
- Restart Chrome after enabling flags

**Extension not showing up:**
- Check that manifest.json is in the root of your folder
- Look for errors in chrome://extensions with Developer mode on

## File Structure

```
health-fact-checker/
├── manifest.json       (Extension configuration)
├── popup.html         (UI for the popup)
├── popup.js           (Popup logic)
├── background.js      (Background service worker)
├── icon16.png         (Small icon)
├── icon48.png         (Medium icon)
├── icon128.png        (Large icon)
└── README.md          (This file)
<<<<<<< HEAD
```
=======
# TrueDose - Health Fact Checker

AI-powered Chrome extension for fact-checking health claims using research papers and community insights.

## Structure

- `extension/` - Chrome extension (Manifest V3)
- `server/` - Vercel serverless backend for OpenAI API calls

## Features

- 🧠 **Embeddings-based subreddit discovery** - Semantic matching to find relevant health communities
- 📚 **PubMed research integration** - Searches peer-reviewed papers with AI-powered query rephrasing
- 💬 **Reddit community analysis** - Analyzes sentiment from real user experiences
- 🎯 **Probabilistic scoring** - Combines research (70%) + community (30%) for confidence scores
- 🤖 **Chrome Built-in AI** - Uses local Gemini Nano for analysis
- 🌍 **Multi-language support** - English, Spanish, Japanese

## Setup

### Extension
1. Install dependencies: `cd extension && npm install`
2. Generate embeddings: `npm run embed:csv`
3. Load unpacked extension in Chrome from `extension/` folder

### Server
1. Install dependencies: `cd server && npm install`
2. Add OpenAI API key to `.env`
3. Deploy: `vercel --prod`

## Tech Stack

- OpenAI Embeddings (text-embedding-3-large)
- OpenAI Chat (gpt-4o-mini for rephrasing)
- Chrome Built-in AI (Gemini Nano)
- PubMed API
- Reddit API
- Vercel (serverless backend)
=======
```
>>>>>>> f8c1984 (Major feature update: Hybrid paper search with metadata extraction)
