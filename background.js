// Background script for Notion Paper Saver
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveToNotion') {
    handleSaveToNotion(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'updateToNotion') {
    handleUpdateToNotion(request.data, request.pageId)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'checkDuplicate') {
    checkForDuplicate(request.url)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ duplicate: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-to-notion') {
    // Get current tab and trigger save
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.action.openPopup();
    }
  }
});

async function handleSaveToNotion(pageData) {
  try {
    // Get user settings
    const settings = await chrome.storage.sync.get(['notionToken', 'databaseId']);
    
    if (!settings.notionToken) {
      throw new Error('Notion token not configured. Please set up your integration in settings.');
    }

    if (!settings.databaseId) {
      throw new Error('Database ID not configured. Please set up your database in settings.');
    }

    // Create the page in Notion
    const notionPage = await createNotionPage(settings, pageData);
    
    // Save to local storage for offline access and duplicate tracking
    await saveToLocalStorage(pageData, notionPage.id);
    
    return notionPage;
    
  } catch (error) {
    console.error('Error saving to Notion:', error);
    throw error;
  }
}

async function handleUpdateToNotion(pageData, pageId) {
  try {
    // Get user settings
    const settings = await chrome.storage.sync.get(['notionToken', 'databaseId']);
    
    if (!settings.notionToken) {
      throw new Error('Notion token not configured. Please set up your integration in settings.');
    }

    if (!settings.databaseId) {
      throw new Error('Database ID not configured. Please set up your database in settings.');
    }

    // Update the existing page in Notion
    const updatedPage = await updateNotionPage(settings, pageData, pageId);
    
    // Update local storage
    await updateLocalStorage(pageData, pageId);
    
    return updatedPage;
    
  } catch (error) {
    console.error('Error updating Notion page:', error);
    throw error;
  }
}

async function createNotionPage(settings, pageData) {
  const { notionToken, databaseId } = settings;
  
  // Validate and clean the pageData
  const cleanedData = {
    title: (pageData.title || "Untitled Page").toString().trim(),
    url: (pageData.url || "").toString().trim(),
    category: (pageData.category || "other").toString().trim(),
    readingStatus: (pageData.readingStatus || "to-read").toString().trim(),
    priority: Boolean(pageData.priority),
    workArea: (pageData.workArea || "personal-interest").toString().trim(),
    notes: (pageData.notes || "").toString().trim(),
    description: (pageData.description || "").toString().trim(),
    type: (pageData.type || "article").toString().trim(),
    domain: (pageData.domain || "").toString().trim(),
    author: (pageData.author || "").toString().trim(),
    savedAt: pageData.savedAt || new Date().toISOString()
  };
  
  // Prepare the page properties - only include basic required properties
  const properties = {
    "Title": {
      "title": [
        {
          "type": "text",
          "text": {
            "content": cleanedData.title
          }
        }
      ]
    },
    "URL": {
      "url": cleanedData.url
    },
    "Category": {
      "select": {
        "name": getCategoryName(cleanedData.category)
      }
    },
    "Status": {
      "select": {
        "name": getStatusName(cleanedData.readingStatus)
      }
    },
    "Priority": {
      "checkbox": cleanedData.priority
    },
    "Work Area": {
      "select": {
        "name": getWorkAreaName(cleanedData.workArea)
      }
    }
  };

  // Only add optional properties if they exist in the database
  // You can manually add these back if your database has them:
  
  // if (pageData.tags && pageData.tags.length > 0) {
  //   properties["Tags"] = {
  //     "multi_select": pageData.tags.map(tag => ({ "name": tag }))
  //   };
  // }

  // if (pageData.author) {
  //   properties["Author"] = {
  //     "rich_text": [
  //       {
  //         "text": {
  //           "content": pageData.author
  //         }
  //       }
  //     ]
  //   };
  // }

  // properties["Type"] = {
  //   "select": {
  //     "name": getTypeName(pageData.type)
  //   }
  // };

  // properties["Domain"] = {
  //   "rich_text": [
  //     {
  //       "text": {
  //         "content": pageData.domain || ""
  //       }
  //     }
  //   ]
  // };

  // properties["Saved Date"] = {
  //   "date": {
  //     "start": pageData.savedAt
  //   }
  // };

  // Prepare page content
  const children = [];
  
  // Add description if available
  if (cleanedData.description) {
    children.push({
      "object": "block",
      "type": "quote",
      "quote": {
        "rich_text": [
          {
            "type": "text",
            "text": {
              "content": cleanedData.description
            }
          }
        ]
      }
    });
  }

  // Add user notes if provided
  if (cleanedData.notes) {
    children.push({
      "object": "block",
      "type": "heading_2",
      "heading_2": {
        "rich_text": [
          {
            "type": "text",
            "text": {
              "content": "📝 My Notes"
            }
          }
        ]
      }
    });
    
    children.push({
      "object": "block",
      "type": "callout",
      "callout": {
        "icon": {
          "emoji": "💭"
        },
        "rich_text": [
          {
            "type": "text",
            "text": {
              "content": cleanedData.notes
            }
          }
        ]
      }
    });
  }

  // Add metadata section
  children.push({
    "object": "block",
    "type": "heading_3",
    "heading_3": {
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": "📊 Metadata"
          }
        }
      ]
    }
  });

  const metadataItems = [
    `**URL**: ${cleanedData.url}`,
    `**Domain**: ${cleanedData.domain}`,
    `**Type**: ${getTypeName(cleanedData.type)}`,
    `**Saved**: ${new Date(cleanedData.savedAt).toLocaleString()}`
  ];

  if (cleanedData.author) {
    metadataItems.push(`**Author**: ${cleanedData.author}`);
  }

  if (pageData.publishDate) {
    metadataItems.push(`**Published**: ${new Date(pageData.publishDate).toLocaleDateString()}`);
  }

  children.push({
    "object": "block",
    "type": "bulleted_list_item",
    "bulleted_list_item": {
      "rich_text": metadataItems.map(item => ({
        "type": "text",
        "text": {
          "content": item + "\n"
        }
      }))
    }
  });

  // Create the page
  const requestBody = {
    parent: {
      database_id: databaseId
    },
    properties: properties,
    children: children
  };

  console.log('Sending request to Notion API:', JSON.stringify(requestBody, null, 2));
  console.log('Work Area value being sent:', cleanedData.workArea);
  console.log('Work Area mapped name:', getWorkAreaName(cleanedData.workArea));

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Notion API error response:', error);
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  return await response.json();
}

// Helper function to determine if a title should be updated
function shouldUpdateTitle(title) {
  if (!title || typeof title !== 'string') return false;
  
  const trimmedTitle = title.trim();
  
  // Don't update if it's empty, "Untitled Page", or other common fallback values
  const skipTitles = [
    'Untitled Page',
    'Untitled',
    'Loading...',
    'Page not found',
    '404',
    'Error',
    ''
  ];
  
  return !skipTitles.includes(trimmedTitle);
}

async function updateNotionPage(settings, pageData, pageId) {
  const { notionToken } = settings;
  
  // Validate and clean the pageData
  const cleanedData = {
    title: (pageData.title || "Untitled Page").toString().trim(),
    url: (pageData.url || "").toString().trim(),
    category: (pageData.category || "other").toString().trim(),
    readingStatus: (pageData.readingStatus || "to-read").toString().trim(),
    priority: Boolean(pageData.priority),
    workArea: (pageData.workArea || "personal-interest").toString().trim(),
    notes: (pageData.notes || "").toString().trim(),
    description: (pageData.description || "").toString().trim(),
    type: (pageData.type || "article").toString().trim(),
    domain: (pageData.domain || "").toString().trim(),
    author: (pageData.author || "").toString().trim(),
    savedAt: pageData.savedAt || new Date().toISOString(),
    isUpdate: pageData.isUpdate || false
  };
  
  // Prepare the page properties for update
  const properties = {};

  // Only update title if it's not the default fallback
  if (shouldUpdateTitle(cleanedData.title)) {
    properties["Title"] = {
      "title": [
        {
          "type": "text",
          "text": {
            "content": cleanedData.title
          }
        }
      ]
    };
    console.log('Title will be updated to:', cleanedData.title);
  } else {
    console.log('Skipping title update - title is not valid for updating:', cleanedData.title);
  }

  // Only update category if a valid category is selected
  if (cleanedData.category && cleanedData.category !== '' && cleanedData.category !== 'other' && cleanedData.category !== 'keep-current') {
    properties["Category"] = {
      "select": {
        "name": getCategoryName(cleanedData.category)
      }
    };
    console.log('Category will be updated to:', cleanedData.category);
  } else {
    console.log('Skipping category update - no valid category selected or keeping current');
  }

  // Only update status if a valid status is selected
  if (cleanedData.readingStatus && cleanedData.readingStatus !== '' && cleanedData.readingStatus !== 'to-read' && cleanedData.readingStatus !== 'keep-current') {
    properties["Status"] = {
      "select": {
        "name": getStatusName(cleanedData.readingStatus)
      }
    };
    console.log('Status will be updated to:', cleanedData.readingStatus);
  } else {
    console.log('Skipping status update - no valid status selected or keeping current');
  }

  // Always update priority since it's a simple boolean
  properties["Priority"] = {
    "checkbox": cleanedData.priority
  };

  // Only update work area if a valid work area is selected
  if (cleanedData.workArea && cleanedData.workArea !== '' && cleanedData.workArea !== 'personal-interest' && cleanedData.workArea !== 'keep-current') {
    properties["Work Area"] = {
      "select": {
        "name": getWorkAreaName(cleanedData.workArea)
      }
    };
    console.log('Work Area will be updated to:', cleanedData.workArea);
  } else {
    console.log('Skipping work area update - no valid work area selected or keeping current');
  }

  console.log('Updating Notion page:', pageId);
  console.log('Update data:', JSON.stringify({ properties }, null, 2));

  // Update the page properties
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({ properties })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Notion API error response:', error);
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  const updatedPage = await response.json();

  // If there are new notes, append them to the page content
  if (cleanedData.notes && cleanedData.notes.trim() !== '') {
    await appendNotesToPage(settings, pageId, cleanedData.notes);
  }

  return updatedPage;
}

async function appendNotesToPage(settings, pageId, notes) {
  const { notionToken } = settings;
  
  console.log('Attempting to append notes to page:', pageId);
  console.log('Notes to append:', notes);
  
  // Add the new notes as a block
  const newNoteBlock = {
    "object": "block",
    "type": "callout",
    "callout": {
      "icon": {
        "emoji": "📝"
      },
      "rich_text": [
        {
          "type": "text",
          "text": {
            "content": `Updated: ${new Date().toLocaleString()}\n${notes}`
          }
        }
      ]
    }
  };

  // Append the note block to the page
  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        children: [newNoteBlock]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to append notes to page:', error);
      console.error('Response status:', response.status);
      console.error('Response status text:', response.statusText);
    } else {
      console.log('Successfully appended notes to page');
    }
  } catch (error) {
    console.error('Error appending notes to page:', error);
  }
}

async function saveToLocalStorage(pageData, notionPageId) {
  const result = await chrome.storage.local.get(['savedPages']);
  const savedPages = result.savedPages || [];
  
  savedPages.push({
    ...pageData,
    notionPageId,
    localSavedAt: Date.now()
  });

  await chrome.storage.local.set({ savedPages: savedPages });
}

async function updateLocalStorage(pageData, notionPageId) {
  const result = await chrome.storage.local.get(['savedPages']);
  const savedPages = result.savedPages || [];
  
  // Find and update the existing entry
  const existingIndex = savedPages.findIndex(page => 
    page.notionPageId === notionPageId || page.url === pageData.url
  );
  
  if (existingIndex !== -1) {
    // Update existing entry
    savedPages[existingIndex] = {
      ...savedPages[existingIndex],
      ...pageData,
      notionPageId,
      lastUpdated: Date.now()
    };
  } else {
    // Add new entry if not found (fallback)
    savedPages.push({
      ...pageData,
      notionPageId,
      localSavedAt: Date.now(),
      lastUpdated: Date.now()
    });
  }

  await chrome.storage.local.set({ savedPages: savedPages });
}

async function checkForDuplicate(url) {
  try {
    // Check local storage first for quick duplicate detection
    const localDuplicate = await checkLocalDuplicate(url);
    if (localDuplicate) {
      return localDuplicate;
    }
    
    // Check Notion database for duplicates
    const settings = await chrome.storage.sync.get(['notionToken', 'databaseId']);
    
    if (!settings.notionToken || !settings.databaseId) {
      return { duplicate: false };
    }
    
    const notionDuplicate = await checkNotionDuplicate(url, settings);
    return notionDuplicate;
    
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return { duplicate: false, error: error.message };
  }
}

async function checkLocalDuplicate(url) {
  try {
    const result = await chrome.storage.local.get(['savedPages']);
    const savedPages = result.savedPages || [];
    
    const duplicate = savedPages.find(page => page.url === url);
    
    if (duplicate) {
      return {
        duplicate: true,
        source: 'local',
        savedAt: duplicate.savedAt || duplicate.localSavedAt,
        notionPageId: duplicate.notionPageId,
        title: duplicate.title
      };
    }
    
    return { duplicate: false };
  } catch (error) {
    console.error('Error checking local duplicates:', error);
    return { duplicate: false };
  }
}

async function checkNotionDuplicate(url, settings) {
  try {
    const { notionToken, databaseId } = settings;
    
    // Query the database for pages with the same URL
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: {
          property: 'URL',
          url: {
            equals: url
          }
        },
        page_size: 1
      })
    });
    
    if (!response.ok) {
      console.error('Failed to query Notion database for duplicates');
      return { duplicate: false };
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const duplicatePage = data.results[0];
      const props = duplicatePage.properties;
      
      // Extract current values from the existing page
      const currentValues = {
        title: props?.Title?.title?.[0]?.text?.content || 'Untitled',
        category: extractSelectValue(props?.Category?.select),
        status: extractSelectValue(props?.Status?.select),
        priority: props?.Priority?.checkbox || false,
        workArea: extractSelectValue(props?.['Work Area']?.select),
        tags: props?.Tags?.multi_select?.map(tag => tag.name) || [],
        author: props?.Author?.rich_text?.[0]?.text?.content || '',
        domain: props?.Domain?.rich_text?.[0]?.text?.content || '',
        type: extractSelectValue(props?.Type?.select)
      };
      
      return {
        duplicate: true,
        source: 'notion',
        notionPageId: duplicatePage.id,
        savedAt: duplicatePage.created_time,
        lastEdited: duplicatePage.last_edited_time,
        title: currentValues.title,
        notionUrl: duplicatePage.url,
        currentValues: currentValues
      };
    }
    
    return { duplicate: false };
    
  } catch (error) {
    console.error('Error checking Notion duplicates:', error);
    return { duplicate: false };
  }
}

// Helper function to extract select field values
function extractSelectValue(selectField) {
  if (!selectField || !selectField.name) return '';
  
  // Convert from display name back to internal value
  const categoryMap = {
    'Research Papers': 'research-papers',
    'Blog Posts': 'blog-posts',
    'Videos': 'videos',
    'Documentation': 'documentation',
    'Articles': 'articles',
    'Tutorials': 'tutorials',
    'Tools': 'tools',
    'Other': 'other'
  };
  
  const statusMap = {
    'To Read': 'to-read',
    'Reading': 'reading',
    'Completed': 'completed',
    'Reference': 'reference'
  };
  
  const workAreaMap = {
    'Work': 'work',
    'Lab': 'lab',
    'Side Project': 'side-project',
    'Personal Interest': 'personal-interest'
  };
  
  const typeMap = {
    'Video': 'video',
    'Research Paper': 'research-paper',
    'Blog Post': 'blog-post',
    'Documentation': 'documentation',
    'Article': 'article'
  };
  
  // Try to find the internal value, fallback to the name itself
  return categoryMap[selectField.name] || 
         statusMap[selectField.name] || 
         workAreaMap[selectField.name] || 
         typeMap[selectField.name] || 
         selectField.name.toLowerCase();
}

// Helper functions
function getCategoryName(category) {
  const categoryMap = {
    'research-papers': 'Research Papers',
    'blog-posts': 'Blog Posts',
    'videos': 'Videos',
    'documentation': 'Documentation',
    'articles': 'Articles',
    'tutorials': 'Tutorials',
    'tools': 'Tools',
    'other': 'Other'
  };
  return categoryMap[category] || 'Other';
}

function getStatusName(status) {
  const statusMap = {
    'to-read': 'To Read',
    'reading': 'Reading',
    'completed': 'Completed',
    'reference': 'Reference'
  };
  return statusMap[status] || 'To Read';
}

function getTypeName(type) {
  const typeMap = {
    'video': 'Video',
    'research-paper': 'Research Paper',
    'blog-post': 'Blog Post',
    'documentation': 'Documentation',
    'article': 'Article'
  };
  return typeMap[type] || 'Article';
}

function getWorkAreaName(workArea) {
  const workAreaMap = {
    'work': 'Work',
    'lab': 'Lab',
    'side-project': 'Side Project',
    'personal-interest': 'Personal Interest'
  };
  return workAreaMap[workArea] || 'Personal Interest';
} 