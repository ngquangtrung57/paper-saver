# 🚀 Quick Setup Guide

## Prerequisites
- Google Chrome browser
- Notion account
- 5 minutes of your time!

## Step-by-Step Setup

### 1. Install the Extension
1. Download this extension folder
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked" and select the extension folder
5. The Notion Paper Saver icon should appear in your toolbar

### 2. Create Notion Integration
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Name it "Paper Saver" or similar
4. Select your workspace
   5. Copy the **Internal Integration Token** (starts with `ntn_` or `secret_`)

### 3. Prepare Your Database
**Option A: Auto-create (Recommended)**
1. Click the extension icon → Settings
2. Paste your integration token
3. Click "Create Template Database"
4. The database ID will be filled automatically

**Option B: Use existing database**
1. Open your Notion database
2. Copy the database ID from the URL
   - URL format: `https://notion.so/workspace/DATABASE_ID?v=...`
   - Database ID is the 32-character string
3. Share the database with your integration:
   - Click "Share" → Add your integration → Done

### 4. Configure Extension
1. Click the extension icon → Settings (gear icon)
2. Paste your integration token
3. Paste your database ID
4. Click "Test Connection" to verify
5. Save your settings

### 5. Start Saving!
- Visit any article, blog, or video
- Click the extension icon
- Choose a category and add notes
- Click "Save to Notion"

## Keyboard Shortcuts
- `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac) - Quick save

## Troubleshooting

### "Connection failed"
- Check your integration token starts with `ntn_` or `secret_`
- Verify the database ID is correct (32 characters)
- Make sure the database is shared with your integration

### "Database not found"
- The database might not be shared with your integration
- Go to your database → Share → Add your integration

### Extension not working
- Make sure you're on Chrome (not Edge, Firefox, etc.)
- Check that Developer mode is enabled
- Try reloading the extension

## Need Help?
- Check the README.md for detailed documentation
- Look at the example database structure
- Open an issue if you find bugs

## Pro Tips
- Set a default category in settings for faster saving
- Use tags to organize related content
- Enable the visual indicator for easier access
- Try the keyboard shortcut for quick saves

---

**You're all set! Happy knowledge collecting! 📚✨** 