# Health Fact Checker Chrome Extension

## Installation Instructions

1. **Download all files** to a folder 

2. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select your `health-fact-checker` folder

3. **Enable Chrome AI** :
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

