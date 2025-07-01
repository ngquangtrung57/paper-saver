// Options page functionality for Notion Paper Saver
document.addEventListener('DOMContentLoaded', async () => {
  const settingsForm = document.getElementById('settingsForm');
  const notionTokenInput = document.getElementById('notionToken');
  const databaseIdInput = document.getElementById('databaseId');
  const defaultCategorySelect = document.getElementById('defaultCategory');
  const defaultWorkAreaSelect = document.getElementById('defaultWorkArea');
  const autoSaveCheckbox = document.getElementById('autoSave');
  const showIndicatorCheckbox = document.getElementById('showIndicator');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const findDatabaseBtn = document.getElementById('findDatabaseBtn');
  const createTemplateBtn = document.getElementById('createTemplateBtn');
  const statusMessage = document.getElementById('statusMessage');
  const databaseList = document.getElementById('databaseList');
  const databasesContainer = document.getElementById('databases');

  // Load saved settings
  await loadSettings();

  // Event listeners
  settingsForm.addEventListener('submit', handleSaveSettings);
  testConnectionBtn.addEventListener('click', handleTestConnection);
  findDatabaseBtn.addEventListener('click', handleFindDatabases);
  createTemplateBtn.addEventListener('click', handleCreateTemplate);

  async function loadSettings() {
    try {
      const settings = await chrome.storage.sync.get([
        'notionToken',
        'databaseId',
        'defaultCategory',
        'defaultWorkArea',
        'autoSave',
        'showIndicator'
      ]);

      if (settings.notionToken) notionTokenInput.value = settings.notionToken;
      if (settings.databaseId) databaseIdInput.value = settings.databaseId;
      if (settings.defaultCategory) defaultCategorySelect.value = settings.defaultCategory;
      if (settings.defaultWorkArea) defaultWorkAreaSelect.value = settings.defaultWorkArea;
      
      autoSaveCheckbox.checked = settings.autoSave || false;
      showIndicatorCheckbox.checked = settings.showIndicator !== false; // Default to true
      
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', 'error');
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    
    const settings = {
      notionToken: notionTokenInput.value.trim(),
      databaseId: databaseIdInput.value.trim(),
      defaultCategory: defaultCategorySelect.value,
      defaultWorkArea: defaultWorkAreaSelect.value,
      autoSave: autoSaveCheckbox.checked,
      showIndicator: showIndicatorCheckbox.checked
    };

    // Validate required fields
    if (!settings.notionToken) {
      showStatus('Please enter your Notion integration token', 'error');
      notionTokenInput.focus();
      return;
    }

    if (!settings.databaseId) {
      showStatus('Please enter your database ID', 'error');
      databaseIdInput.focus();
      return;
    }

    // Validate token format (support both old and new formats)
    if (!settings.notionToken.startsWith('secret_') && !settings.notionToken.startsWith('ntn_')) {
      showStatus('Invalid token format. Token should start with "secret_" or "ntn_"', 'error');
      notionTokenInput.focus();
      return;
    }

    // Validate database ID format
    if (!/^[a-f0-9]{32}$/.test(settings.databaseId.replace(/-/g, ''))) {
      showStatus('Invalid database ID format. Should be 32 characters long', 'error');
      databaseIdInput.focus();
      return;
    }

    try {
      showStatus('Saving settings...', 'loading');
      
      await chrome.storage.sync.set(settings);
      
      showStatus('Settings saved successfully! 🎉', 'success');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings. Please try again.', 'error');
    }
  }

  async function handleTestConnection() {
    const token = notionTokenInput.value.trim();
    const databaseId = databaseIdInput.value.trim();

    if (!token || !databaseId) {
      showStatus('Please enter both token and database ID first', 'error');
      return;
    }

    testConnectionBtn.classList.add('loading');
    showStatus('Testing connection...', 'loading');

    try {
      // Test by retrieving the database
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (response.ok) {
        const database = await response.json();
        showStatus(`✅ Connection successful! Connected to "${database.title[0]?.text?.content || 'Untitled'}"`, 'success');
      } else {
        const error = await response.json();
        showStatus(`❌ Connection failed: ${error.message}`, 'error');
      }
      
    } catch (error) {
      console.error('Connection test error:', error);
      showStatus('❌ Connection failed. Check your token and database ID.', 'error');
    } finally {
      testConnectionBtn.classList.remove('loading');
    }
  }

  async function handleFindDatabases() {
    const token = notionTokenInput.value.trim();

    if (!token) {
      showStatus('Please enter your Notion token first', 'error');
      notionTokenInput.focus();
      return;
    }

    findDatabaseBtn.classList.add('loading');
    showStatus('Searching for databases...', 'loading');

    try {
      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          filter: {
            property: 'object',
            value: 'database'
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        displayDatabases(data.results);
        showStatus(`Found ${data.results.length} database(s)`, 'success');
      } else {
        const error = await response.json();
        showStatus(`Error: ${error.message}`, 'error');
      }
      
    } catch (error) {
      console.error('Database search error:', error);
      showStatus('Error searching databases. Check your token.', 'error');
    } finally {
      findDatabaseBtn.classList.remove('loading');
    }
  }

  function displayDatabases(databases) {
    databasesContainer.innerHTML = '';
    
    if (databases.length === 0) {
      databasesContainer.innerHTML = '<p>No databases found. Make sure your integration has access to databases.</p>';
      databaseList.style.display = 'block';
      return;
    }

    databases.forEach(db => {
      const dbItem = document.createElement('div');
      dbItem.className = 'database-item';
      dbItem.innerHTML = `
        <div class="database-title">${db.title[0]?.text?.content || 'Untitled Database'}</div>
        <div class="database-id">${db.id}</div>
      `;
      
      dbItem.addEventListener('click', () => {
        // Remove selection from other items
        document.querySelectorAll('.database-item').forEach(item => {
          item.classList.remove('selected');
        });
        
        // Select this item
        dbItem.classList.add('selected');
        
        // Set the database ID
        databaseIdInput.value = db.id;
        
        showStatus('Database selected!', 'success');
      });
      
      databasesContainer.appendChild(dbItem);
    });

    databaseList.style.display = 'block';
  }

  async function handleCreateTemplate() {
    const token = notionTokenInput.value.trim();

    if (!token) {
      showStatus('Please enter your Notion token first', 'error');
      notionTokenInput.focus();
      return;
    }

    createTemplateBtn.classList.add('loading');
    showStatus('Creating template database...', 'loading');

    try {
      // First, try to create a parent page if none exists
      let parentPageId;
      
      // Search for existing pages
      const pagesResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          filter: {
            property: 'object',
            value: 'page'
          }
        })
      });

      if (pagesResponse.ok) {
        const pagesData = await pagesResponse.json();
        if (pagesData.results.length > 0) {
          parentPageId = pagesData.results[0].id;
        }
      }

      // If no pages found, create one first
      if (!parentPageId) {
        showStatus('Creating workspace page first...', 'loading');
        
        const createPageResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28'
          },
          body: JSON.stringify({
            parent: {
              type: 'page_id',
              page_id: 'root' // This should work for workspace root
            },
            properties: {
              title: {
                title: [
                  {
                    type: 'text',
                    text: {
                      content: 'Paper Saver Workspace'
                    }
                  }
                ]
              }
            }
          })
        });

        if (createPageResponse.ok) {
          const newPage = await createPageResponse.json();
          parentPageId = newPage.id;
        } else {
          // If page creation fails, try creating database without parent
          parentPageId = null;
        }
      }

      // Create the database
      showStatus('Creating database with all properties...', 'loading');
      
      const databasePayload = {
        title: [
          {
            type: 'text',
            text: {
              content: 'Paper Saver Collection'
            }
          }
        ],
        properties: {
          'Title': {
            title: {}
          },
          'URL': {
            url: {}
          },
          'Category': {
            select: {
              options: [
                { name: 'Research Papers', color: 'blue' },
                { name: 'Blog Posts', color: 'orange' },
                { name: 'Videos', color: 'red' },
                { name: 'Documentation', color: 'green' },
                { name: 'Articles', color: 'gray' },
                { name: 'Tutorials', color: 'purple' },
                { name: 'Tools', color: 'yellow' },
                { name: 'Other', color: 'default' }
              ]
            }
          },
          'Status': {
            select: {
              options: [
                { name: 'To Read', color: 'red' },
                { name: 'Reading', color: 'yellow' },
                { name: 'Completed', color: 'green' },
                { name: 'Reference', color: 'gray' }
              ]
            }
          },
          'Priority': {
            checkbox: {}
          },
          'Work Area': {
            select: {
              options: [
                { name: 'Work', color: 'blue' },
                { name: 'Lab', color: 'green' },
                { name: 'Side Project', color: 'purple' },
                { name: 'Personal Interest', color: 'orange' }
              ]
            }
          },
          'Type': {
            select: {
              options: [
                { name: 'Article', color: 'default' },
                { name: 'Video', color: 'red' },
                { name: 'Research Paper', color: 'blue' },
                { name: 'Blog Post', color: 'orange' },
                { name: 'Documentation', color: 'green' }
              ]
            }
          },
          'Tags': {
            multi_select: {
              options: []
            }
          },
          'Domain': {
            rich_text: {}
          },
          'Author': {
            rich_text: {}
          },
          'Saved Date': {
            date: {}
          }
        }
      };

      // Ensure parent is set: use page if available, else workspace root
      if (parentPageId) {
        databasePayload.parent = {
          type: 'page_id',
          page_id: parentPageId
        };
      } else {
        databasePayload.parent = {
          workspace: true
        };
      }

      const createResponse = await fetch('https://api.notion.com/v1/databases', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify(databasePayload)
      });

      if (createResponse.ok) {
        const database = await createResponse.json();
        databaseIdInput.value = database.id;
        showStatus('✅ Template database created successfully!', 'success');
      } else {
        const error = await createResponse.json();
        throw new Error(error.message);
      }
      
    } catch (error) {
      console.error('Template creation error:', error);
      showStatus(`❌ Error creating template: ${error.message}`, 'error');
    } finally {
      createTemplateBtn.classList.remove('loading');
    }
  }

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 5000);
    }
  }
}); 