# 📑 Notion Paper Saver - Chrome Extension

A powerful Chrome extension that lets you save papers, articles, blogs, videos, and documents directly to your Notion workspace with intelligent categorization and note-taking features.

## ✨ Features

### Core Functionality
- **One-Click Save**: Save any webpage to Notion with a single click
- **Smart Detection**: Automatically detects content types (papers, videos, blogs, docs)
- **Update Existing Entries**: Update status, category, work area, and add notes to previously saved items
- **Duplicate Detection**: Warns when trying to save the same URL and offers update options
- **Category Organization**: Choose from predefined categories or create custom ones
- **Quick Notes**: Add personal notes and annotations while saving
- **Reading Status Tracking**: Mark items as "To Read", "Reading", "Completed", or "Reference"

### Advanced Features
- **Auto-Extract Metadata**: Automatically extracts title, description, author, and publication date
- **Tag Support**: Add custom tags for better organization
- **Priority Marking**: Mark important items as high priority
- **Keyboard Shortcuts**: Quick save with `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac)
- **Visual Indicator**: Hover indicator in the top-right corner of pages
- **Reading Time Estimation**: Calculates estimated reading time for articles

### Smart Content Detection
- **Research Papers**: ArXiv, IEEE, ACM, ResearchGate, and more
- **Videos**: YouTube, Vimeo, and other video platforms
- **Blog Posts**: Medium, Dev.to, personal blogs
- **Documentation**: Official docs, wikis, guides
- **News Articles**: Major news sites and publications

## 🚀 Installation

### From Source (Development)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will appear in your toolbar

### Setting Up Notion Integration
1. **Create a Notion Integration**:
   - Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
   - Click "New integration"
   - Give it a name like "Paper Saver"
   - Copy the "Internal Integration Token"

2. **Create or Prepare a Database**:
   - Create a new database in Notion
   - Or use the extension's "Create Template Database" feature
   - Share the database with your integration

3. **Configure the Extension**:
   - Click the extension icon and go to Settings
   - Enter your Notion token and database ID
   - Test the connection
   - Customize your preferences

## 📋 Required Database Properties

Your Notion database should have these properties for full functionality:

| Property Name | Type | Required | Description |
|---------------|------|----------|-------------|
| Title | Title | ✅ | Page title |
| URL | URL | ✅ | Original webpage URL |
| Category | Select | ✅ | Content category |
| Status | Select | ✅ | Reading status |
| Priority | Checkbox | ❌ | High priority flag |
| Type | Select | ❌ | Content type (auto-detected) |
| Tags | Multi-select | ❌ | Custom tags |
| Domain | Rich Text | ❌ | Website domain |
| Author | Rich Text | ❌ | Content author |
| Saved Date | Date | ❌ | When item was saved |

## 🎯 Usage

### Quick Save
1. Navigate to any article, paper, or video
2. Click the extension icon in your toolbar
3. Choose a category and add notes if desired
4. Click "Save to Notion"

### Keyboard Shortcut
- Press `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (Mac) to quick save

### Updating Existing Entries
When you try to save a URL that's already in your Notion database:

1. **Duplicate Detection**: The extension will show a warning with current values
2. **Three Options**:
   - **View Existing**: Opens the existing Notion page in a new tab
   - **Update Existing**: Pre-fills the form with current values for easy updating
   - **Save Anyway**: Creates a new entry despite the duplicate

3. **Update Process**:
   - Click "Update Existing" to enter update mode
   - Modify any fields (status, category, work area, priority, notes)
   - Notes will be appended (not overwritten) to preserve existing content
   - Click "Update in Notion" to save changes

### Visual Indicator
- Hover near the top-right corner of any page to see the save indicator
- Click it to open the save dialog

## ⚙️ Configuration Options

### Categories
- 📄 Research Papers
- 📝 Blog Posts  
- 🎥 Videos
- 📚 Documentation
- 📰 Articles
- 🎓 Tutorials
- 🔧 Tools
- 📋 Other

### Reading Statuses
- 📚 To Read
- 👀 Currently Reading  
- ✅ Completed
- 🔖 Reference

### Preferences
- **Default Category**: Pre-select a category for faster saving
- **Auto-Save**: Automatically save detected content types
- **Show Indicator**: Enable/disable the hover save indicator

## 🛠️ Technical Details

### Permissions Required
- `activeTab`: Access current page content
- `storage`: Save user preferences
- `scripting`: Extract page information
- `https://api.notion.com/*`: Communicate with Notion API

### Content Script Features
- Enhanced metadata extraction from multiple sources
- Smart content type detection based on URL patterns and page content
- Reading time estimation
- Keyword extraction from meta tags and page content

### Privacy & Security
- All data is saved directly to your Notion workspace
- No data is sent to third-party servers
- Notion token is stored securely in Chrome's sync storage
- Open source for transparency

## 🤝 Contributing

Contributions are welcome! Here are ways to help:

1. **Report Issues**: Found a bug? Report it on GitHub
2. **Feature Requests**: Suggest new features or improvements
3. **Code Contributions**: Submit pull requests with enhancements
4. **Documentation**: Help improve the documentation

### Development Setup
1. Clone the repository
2. Make your changes
3. Test thoroughly on different websites
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Thanks to the Notion team for their excellent API
- Inspired by research workflow optimization
- Built with modern web technologies

## 📞 Support

- **Issues**: Report bugs on GitHub
- **Feature Requests**: Open an issue with the enhancement label
- **Documentation**: Check the Notion API docs for integration details

---

**Made with ❤️ for researchers, students, and knowledge workers everywhere.** 