// Paper Saver - Background Service Worker v2.0

// ============================================================
// CONSTANTS - Notion database schema
// ============================================================

const PAPER_SAVER_DB_SCHEMA = {
  'Title': { title: {} },
  'URL': { url: {} },
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
  'Priority': { checkbox: {} },
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
  'Tags': { multi_select: { options: [] } },
  'Domain': { rich_text: {} },
  'Author': { rich_text: {} },
  'Saved Date': { date: {} }
};

// ============================================================
// STARTUP - Context Menus + Migration
// ============================================================

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-page',
      title: 'Save page to Notion',
      contexts: ['page', 'frame']
    });
    chrome.contextMenus.create({
      id: 'save-link',
      title: 'Save link to Notion',
      contexts: ['link']
    });
    chrome.contextMenus.create({
      id: 'save-selection',
      title: 'Save selection as highlight',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  migrateFromLegacy();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

// ============================================================
// MIGRATION - one-time migration from single-DB to projects
// ============================================================

async function migrateFromLegacy() {
  try {
    const localData = await chrome.storage.local.get(['projects', 'migrated']);
    if (localData.migrated) return;
    if (localData.projects && localData.projects.length > 0) {
      await chrome.storage.local.set({ migrated: true });
      return;
    }

    const syncData = await chrome.storage.sync.get(['notionToken', 'databaseId', 'defaultCategory', 'defaultWorkArea']);

    if (syncData.databaseId) {
      const defaultProject = {
        id: generateId(),
        name: 'My Reading List',
        databaseId: syncData.databaseId,
        color: '#667eea',
        icon: '📚',
        defaultCategory: syncData.defaultCategory || '',
        defaultWorkArea: syncData.defaultWorkArea || '',
        createdAt: Date.now()
      };

      await chrome.storage.sync.set({ activeProjectId: defaultProject.id });
      await chrome.storage.local.set({ projects: [defaultProject], migrated: true });

      // Tag existing savedPages with this projectId
      const savedResult = await chrome.storage.local.get(['savedPages']);
      const savedPages = (savedResult.savedPages || []).map(p => ({
        ...p,
        projectId: p.projectId || defaultProject.id
      }));
      await chrome.storage.local.set({ savedPages });

      console.log('[Paper Saver] Migrated legacy config to project:', defaultProject.name);
    } else {
      await chrome.storage.local.set({ migrated: true });
    }
  } catch (error) {
    console.error('[Paper Saver] Migration error:', error);
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ============================================================
// PROJECT HELPERS
// ============================================================

async function getProjects() {
  const result = await chrome.storage.local.get(['projects']);
  return result.projects || [];
}

async function getActiveProjectId() {
  const result = await chrome.storage.sync.get(['activeProjectId']);
  return result.activeProjectId || null;
}

async function getActiveProject(overrideProjectId) {
  const projects = await getProjects();
  if (projects.length === 0) return null;
  const activeId = overrideProjectId || (await getActiveProjectId());
  return projects.find(p => p.id === activeId) || projects[0];
}

async function getActiveDatabaseId(overrideProjectId) {
  const project = await getActiveProject(overrideProjectId);
  if (project && project.databaseId) return project.databaseId;
  // Fall back to legacy single-DB setting
  const syncData = await chrome.storage.sync.get(['databaseId']);
  return syncData.databaseId || null;
}

async function getNotionToken() {
  const result = await chrome.storage.sync.get(['notionToken']);
  return result.notionToken || null;
}

// Extract and normalize a Notion page/database ID from a URL or raw string
function extractNotionId(input) {
  if (!input) return null;
  input = input.trim();

  // Match 32-hex string embedded in a URL (before ?v= or # or end)
  const urlMatch = input.match(/([a-f0-9]{32})(?:[?&#]|$)/i) ||
                   input.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (urlMatch) {
    const raw = urlMatch[1].replace(/-/g, '');
    return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
  }

  const cleanId = input.replace(/-/g, '');
  if (/^[a-f0-9]{32}$/i.test(cleanId)) {
    return `${cleanId.slice(0,8)}-${cleanId.slice(8,12)}-${cleanId.slice(12,16)}-${cleanId.slice(16,20)}-${cleanId.slice(20)}`;
  }

  return null;
}

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'saveToNotion') {
    handleSaveToNotion(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'updateToNotion') {
    handleUpdateToNotion(request.data, request.pageId)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'checkDuplicate') {
    checkForDuplicate(request.url, request.projectId)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ duplicate: false, error: error.message }));
    return true;
  }

  if (request.action === 'getProjects') {
    (async () => {
      const projects = await getProjects();
      const activeProjectId = await getActiveProjectId();
      sendResponse({ projects, activeProjectId });
    })();
    return true;
  }

  if (request.action === 'setActiveProject') {
    chrome.storage.sync.set({ activeProjectId: request.projectId })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'createProject') {
    (async () => {
      try {
        const projects = await getProjects();
        const newProject = {
          id: generateId(),
          name: request.project.name || 'New Project',
          databaseId: request.project.databaseId || '',
          color: request.project.color || '#667eea',
          icon: request.project.icon || '📄',
          defaultCategory: request.project.defaultCategory || '',
          defaultWorkArea: request.project.defaultWorkArea || '',
          createdAt: Date.now()
        };
        projects.push(newProject);
        await chrome.storage.local.set({ projects });

        // Auto-set as active if first project
        if (projects.length === 1) {
          await chrome.storage.sync.set({ activeProjectId: newProject.id });
        }

        sendResponse({ success: true, project: newProject });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'updateProject') {
    (async () => {
      try {
        const projects = await getProjects();
        const idx = projects.findIndex(p => p.id === request.project.id);
        if (idx === -1) {
          sendResponse({ success: false, error: 'Project not found' });
          return;
        }
        projects[idx] = { ...projects[idx], ...request.project };
        await chrome.storage.local.set({ projects });
        sendResponse({ success: true, project: projects[idx] });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'deleteProject') {
    (async () => {
      try {
        let projects = await getProjects();
        projects = projects.filter(p => p.id !== request.projectId);
        await chrome.storage.local.set({ projects });

        const activeId = await getActiveProjectId();
        if (activeId === request.projectId) {
          const newActiveId = projects.length > 0 ? projects[0].id : null;
          await chrome.storage.sync.set({ activeProjectId: newActiveId });
        }

        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (request.action === 'createNotionDatabase') {
    handleCreateNotionDatabase(request.token, request.parentPageId, request.dbName)
      .then(db => sendResponse({ success: true, databaseId: db.id }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'findNotionPages') {
    handleFindNotionPages(request.token)
      .then(pages => sendResponse({ success: true, pages }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'testConnection') {
    testNotionConnection(request.token, request.databaseId)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

// ============================================================
// CONTEXT MENU HANDLER
// ============================================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const token = await getNotionToken();
    if (!token) {
      showNotification('Notion Paper Saver', 'Please configure your Notion token in settings first.');
      return;
    }

    const project = await getActiveProject();
    const databaseId = await getActiveDatabaseId();

    if (!databaseId) {
      showNotification('Notion Paper Saver', 'Please configure a project/database in settings first.');
      return;
    }

    if (info.menuItemId === 'save-page') {
      let pageData = null;
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.extractPageInfo ? window.extractPageInfo() : null
        });
        pageData = results[0]?.result;
      } catch (e) { /* ignore - not all pages support scripting */ }

      if (!pageData) {
        let hostname = '';
        try { hostname = new URL(tab.url).hostname; } catch (e) {}
        pageData = {
          title: tab.title || 'Untitled',
          url: tab.url,
          description: '',
          type: 'article',
          author: '',
          domain: hostname
        };
      }

      pageData.category = project?.defaultCategory || 'articles';
      pageData.workArea = project?.defaultWorkArea || 'personal-interest';
      pageData.readingStatus = 'to-read';
      pageData.priority = false;
      pageData.savedAt = new Date().toISOString();
      pageData.projectId = project?.id;
      pageData.tags = pageData.suggestedTags || pageData.keywords?.slice(0, 5) || [];

      await handleSaveToNotion(pageData);
      showNotification('Saved to Notion ✓', `"${pageData.title.substring(0, 60)}" saved to ${project?.name || 'Notion'}`);

    } else if (info.menuItemId === 'save-link') {
      const url = info.linkUrl;
      let hostname = '';
      try { hostname = new URL(url).hostname; } catch (e) {}

      const pageData = {
        title: info.linkText || hostname || url.substring(0, 80),
        url,
        description: '',
        type: 'article',
        author: '',
        domain: hostname,
        category: project?.defaultCategory || 'articles',
        workArea: project?.defaultWorkArea || 'personal-interest',
        readingStatus: 'to-read',
        priority: false,
        tags: [],
        savedAt: new Date().toISOString(),
        projectId: project?.id
      };

      await handleSaveToNotion(pageData);
      showNotification('Link Saved ✓', `Saved to ${project?.name || 'Notion'}`);

    } else if (info.menuItemId === 'save-selection') {
      const selectedText = info.selectionText || '';
      if (!selectedText.trim()) return;

      const titlePreview = selectedText.substring(0, 80) + (selectedText.length > 80 ? '...' : '');
      let hostname = '';
      try { hostname = new URL(tab.url).hostname; } catch (e) {}

      const pageData = {
        title: titlePreview,
        url: tab.url,
        description: '',
        type: 'article',
        author: '',
        domain: hostname,
        category: project?.defaultCategory || 'articles',
        workArea: project?.defaultWorkArea || 'personal-interest',
        readingStatus: 'reference',
        priority: false,
        tags: [],
        savedAt: new Date().toISOString(),
        projectId: project?.id,
        highlight: selectedText,
        sourceTitle: tab.title
      };

      await handleSaveToNotion(pageData);
      showNotification('Highlight Saved ✓', `Saved to ${project?.name || 'Notion'}`);
    }
  } catch (error) {
    console.error('[Paper Saver] Context menu save error:', error);
    showNotification('Save Failed', error.message.substring(0, 100));
  }
});

function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title,
      message
    });
  } catch (e) { /* ignore notification errors */ }
}

// ============================================================
// KEYBOARD SHORTCUT
// ============================================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-to-notion') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.action.openPopup();
  }
});

// ============================================================
// TAB BADGE - show ✓ on already-saved tabs
// ============================================================

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  try {
    const syncData = await chrome.storage.sync.get(['showIndicator']);
    if (syncData.showIndicator === false) return;

    const duplicate = await checkLocalDuplicate(tab.url);
    if (duplicate && duplicate.duplicate) {
      await chrome.action.setBadgeText({ text: '✓', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#28a745', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (e) {
    // Ignore — tab may have closed
  }
});

// ============================================================
// SAVE / UPDATE HANDLERS
// ============================================================

async function handleSaveToNotion(pageData) {
  const token = await getNotionToken();
  if (!token) {
    throw new Error('Notion token not configured. Please set up your integration in settings.');
  }

  const databaseId = await getActiveDatabaseId(pageData.projectId);
  if (!databaseId) {
    throw new Error('No database configured. Please set up a project in settings.');
  }

  const notionPage = await createNotionPage({ notionToken: token, databaseId }, pageData);

  const project = await getActiveProject(pageData.projectId);
  await saveToLocalStorage({ ...pageData, projectId: project?.id || null }, notionPage.id);

  return notionPage;
}

async function handleUpdateToNotion(pageData, pageId) {
  const token = await getNotionToken();
  if (!token) {
    throw new Error('Notion token not configured. Please set up your integration in settings.');
  }

  if (!pageId) {
    throw new Error('Page ID is required for updating an existing entry.');
  }

  // Normalize page ID to UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(pageId)) {
    const cleanId = pageId.replace(/-/g, '');
    if (cleanId.length === 32) {
      pageId = `${cleanId.slice(0,8)}-${cleanId.slice(8,12)}-${cleanId.slice(12,16)}-${cleanId.slice(16,20)}-${cleanId.slice(20)}`;
    }
  }

  try {
    const updatedPage = await updateNotionPage({ notionToken: token }, pageData, pageId);
    await updateLocalStorage(pageData, pageId);
    return updatedPage;
  } catch (error) {
    if (error.message.includes('404')) {
      throw new Error('The page to update was not found. It may have been deleted.');
    } else if (error.message.includes('403')) {
      throw new Error('Permission denied. Make sure your integration has access to this page.');
    } else if (error.message.includes('401')) {
      throw new Error('Authentication failed. Please check your Notion token in settings.');
    } else if (error.message.includes('400')) {
      throw new Error('Invalid request. Check that your database properties match the extension schema.');
    }
    throw error;
  }
}

// ============================================================
// NOTION PAGE CREATION
// ============================================================

async function createNotionPage(settings, pageData) {
  const { notionToken, databaseId } = settings;

  const cleanedData = {
    title: (pageData.title || 'Untitled Page').toString().trim(),
    url: (pageData.url || '').toString().trim(),
    category: (pageData.category || 'other').toString().trim(),
    readingStatus: (pageData.readingStatus || 'to-read').toString().trim(),
    priority: Boolean(pageData.priority),
    workArea: (pageData.workArea || 'personal-interest').toString().trim(),
    notes: (pageData.notes || '').toString().trim(),
    description: (pageData.description || '').toString().trim(),
    type: (pageData.type || 'article').toString().trim(),
    domain: (pageData.domain || '').toString().trim(),
    author: (pageData.author || '').toString().trim(),
    savedAt: pageData.savedAt || new Date().toISOString(),
    tags: Array.isArray(pageData.tags) ? pageData.tags.filter(Boolean) : [],
    highlight: (pageData.highlight || '').toString().trim()
  };

  const properties = {
    'Title': {
      title: [{ type: 'text', text: { content: cleanedData.title } }]
    },
    'URL': { url: cleanedData.url || null },
    'Category': { select: { name: getCategoryName(cleanedData.category) } },
    'Status': { select: { name: getStatusName(cleanedData.readingStatus) } },
    'Priority': { checkbox: cleanedData.priority },
    'Work Area': { select: { name: getWorkAreaName(cleanedData.workArea) } },
    'Type': { select: { name: getTypeName(cleanedData.type) } },
    'Saved Date': { date: { start: cleanedData.savedAt } }
  };

  if (cleanedData.domain) {
    properties['Domain'] = {
      rich_text: [{ text: { content: cleanedData.domain } }]
    };
  }

  if (cleanedData.author) {
    properties['Author'] = {
      rich_text: [{ text: { content: cleanedData.author.substring(0, 2000) } }]
    };
  }

  if (cleanedData.tags.length > 0) {
    properties['Tags'] = {
      multi_select: cleanedData.tags.slice(0, 20).map(tag => ({
        name: tag.toString().substring(0, 100)
      }))
    };
  }

  // Build page content blocks
  const children = [];

  // Highlight block (from right-click selection or popup selection)
  if (cleanedData.highlight) {
    children.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: '💡' },
        rich_text: [{
          type: 'text',
          text: { content: cleanedData.highlight.substring(0, 2000) }
        }]
      }
    });
    if (pageData.sourceTitle && pageData.sourceTitle !== cleanedData.title) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: {
              content: `Source: ${pageData.sourceTitle}`,
              link: { url: cleanedData.url }
            }
          }]
        }
      });
    }
    children.push({ object: 'block', type: 'divider', divider: {} });
  }

  if (cleanedData.description) {
    children.push({
      object: 'block',
      type: 'quote',
      quote: {
        rich_text: [{ type: 'text', text: { content: cleanedData.description.substring(0, 2000) } }]
      }
    });
  }

  if (cleanedData.notes) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: '📝 My Notes' } }] }
    });
    children.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: '💭' },
        rich_text: [{ type: 'text', text: { content: cleanedData.notes.substring(0, 2000) } }]
      }
    });
  }

  children.push({
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content: '📊 Metadata' } }] }
  });

  const metaLines = [
    `URL: ${cleanedData.url}`,
    `Domain: ${cleanedData.domain}`,
    `Type: ${getTypeName(cleanedData.type)}`,
    `Saved: ${new Date(cleanedData.savedAt).toLocaleString()}`
  ];
  if (cleanedData.author) metaLines.push(`Author: ${cleanedData.author}`);
  if (pageData.publishDate) {
    try { metaLines.push(`Published: ${new Date(pageData.publishDate).toLocaleDateString()}`); } catch (e) {}
  }
  if (cleanedData.tags.length > 0) metaLines.push(`Tags: ${cleanedData.tags.join(', ')}`);

  children.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: metaLines.join('\n') } }]
    }
  });

  const requestBody = {
    parent: { database_id: databaseId },
    properties,
    children
  };

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
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  return await response.json();
}

// ============================================================
// NOTION PAGE UPDATE
// ============================================================

function shouldUpdateTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const skipTitles = ['Untitled Page', 'Untitled', 'Loading...', 'Page not found', '404', 'Error', ''];
  return !skipTitles.includes(title.trim());
}

async function updateNotionPage(settings, pageData, pageId) {
  const { notionToken } = settings;

  const cleanedData = {
    title: (pageData.title || 'Untitled Page').toString().trim(),
    category: (pageData.category || '').toString().trim(),
    readingStatus: (pageData.readingStatus || '').toString().trim(),
    priority: Boolean(pageData.priority),
    workArea: (pageData.workArea || '').toString().trim(),
    notes: (pageData.notes || '').toString().trim()
  };

  const properties = {};

  if (shouldUpdateTitle(cleanedData.title)) {
    properties['Title'] = {
      title: [{ type: 'text', text: { content: cleanedData.title } }]
    };
  }

  if (cleanedData.category && cleanedData.category !== '' && cleanedData.category !== 'keep-current') {
    properties['Category'] = { select: { name: getCategoryName(cleanedData.category) } };
  }

  if (cleanedData.readingStatus && cleanedData.readingStatus !== '' && cleanedData.readingStatus !== 'keep-current') {
    properties['Status'] = { select: { name: getStatusName(cleanedData.readingStatus) } };
  }

  properties['Priority'] = { checkbox: cleanedData.priority };

  if (cleanedData.workArea && cleanedData.workArea !== '' && cleanedData.workArea !== 'keep-current') {
    properties['Work Area'] = { select: { name: getWorkAreaName(cleanedData.workArea) } };
  }

  if (Object.keys(properties).length > 0) {
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
      throw new Error(`Notion API error (${response.status}): ${error.message || response.statusText}`);
    }
  }

  if (cleanedData.notes) {
    await appendNotesToPage(settings, pageId, cleanedData.notes);
  }

  return { id: pageId, updated: true };
}

async function appendNotesToPage(settings, pageId, notes) {
  const { notionToken } = settings;
  try {
    const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        children: [{
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '📝' },
            rich_text: [{
              type: 'text',
              text: { content: `Updated: ${new Date().toLocaleString()}\n${notes}` }
            }]
          }
        }]
      })
    });
    if (!response.ok) {
      console.warn('[Paper Saver] Notes append failed, continuing...');
    }
  } catch (e) {
    console.warn('[Paper Saver] Notes append error:', e.message);
  }
}

// ============================================================
// NOTION DATABASE CREATION
// ============================================================

async function handleCreateNotionDatabase(token, parentPageId, dbName) {
  const cleanParentId = extractNotionId(parentPageId);
  if (!cleanParentId) {
    throw new Error('Invalid parent page URL or ID. Please paste a valid Notion page URL or ID.');
  }

  const response = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: cleanParentId },
      title: [{ type: 'text', text: { content: dbName || 'Paper Saver Collection' } }],
      properties: PAPER_SAVER_DB_SCHEMA
    })
  });

  if (!response.ok) {
    const error = await response.json();
    if (response.status === 404) {
      throw new Error('Parent page not found. Make sure you shared it with your integration via the "..." menu → "Add connections".');
    }
    throw new Error(error.message || `API error ${response.status}`);
  }

  return await response.json();
}

async function handleFindNotionPages(token) {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      filter: { property: 'object', value: 'page' },
      page_size: 25
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to search pages');
  }

  const data = await response.json();
  return data.results.map(page => ({
    id: page.id,
    title: page.properties?.title?.title?.[0]?.text?.content ||
           page.properties?.Name?.title?.[0]?.text?.content ||
           'Untitled Page'
  }));
}

async function testNotionConnection(token, databaseId) {
  const cleanId = extractNotionId(databaseId);
  if (!cleanId) throw new Error('Invalid database ID format.');

  const response = await fetch(`https://api.notion.com/v1/databases/${cleanId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Connection failed (${response.status})`);
  }

  const db = await response.json();
  const dbTitle = db.title?.[0]?.text?.content || 'Untitled';
  return { dbTitle };
}

// ============================================================
// LOCAL STORAGE
// ============================================================

async function saveToLocalStorage(pageData, notionPageId) {
  const result = await chrome.storage.local.get(['savedPages']);
  const savedPages = result.savedPages || [];
  savedPages.push({ ...pageData, notionPageId, localSavedAt: Date.now() });
  await chrome.storage.local.set({ savedPages });
}

async function updateLocalStorage(pageData, notionPageId) {
  const result = await chrome.storage.local.get(['savedPages']);
  const savedPages = result.savedPages || [];
  const existingIndex = savedPages.findIndex(
    page => page.notionPageId === notionPageId || page.url === pageData.url
  );

  if (existingIndex !== -1) {
    savedPages[existingIndex] = {
      ...savedPages[existingIndex],
      ...pageData,
      notionPageId,
      lastUpdated: Date.now()
    };
  } else {
    savedPages.push({ ...pageData, notionPageId, localSavedAt: Date.now(), lastUpdated: Date.now() });
  }

  await chrome.storage.local.set({ savedPages });
}

// ============================================================
// DUPLICATE DETECTION
// ============================================================

async function checkForDuplicate(url, projectId) {
  try {
    const localDuplicate = await checkLocalDuplicate(url);
    if (localDuplicate && localDuplicate.duplicate) return localDuplicate;

    const token = await getNotionToken();
    const databaseId = await getActiveDatabaseId(projectId);

    if (!token || !databaseId) return { duplicate: false };

    return await checkNotionDuplicate(url, { notionToken: token, databaseId });
  } catch (error) {
    console.error('[Paper Saver] Duplicate check error:', error);
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
    return { duplicate: false };
  }
}

async function checkNotionDuplicate(url, settings) {
  try {
    const { notionToken, databaseId } = settings;
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: { property: 'URL', url: { equals: url } },
        page_size: 1
      })
    });

    if (!response.ok) return { duplicate: false };

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const duplicatePage = data.results[0];
      const props = duplicatePage.properties;
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
        currentValues
      };
    }

    return { duplicate: false };
  } catch (error) {
    console.error('[Paper Saver] Notion duplicate check error:', error);
    return { duplicate: false };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function extractSelectValue(selectField) {
  if (!selectField || !selectField.name) return '';
  const maps = {
    'Research Papers': 'research-papers', 'Blog Posts': 'blog-posts',
    'Videos': 'videos', 'Documentation': 'documentation',
    'Articles': 'articles', 'Tutorials': 'tutorials',
    'Tools': 'tools', 'Other': 'other',
    'To Read': 'to-read', 'Reading': 'reading',
    'Completed': 'completed', 'Reference': 'reference',
    'Work': 'work', 'Lab': 'lab',
    'Side Project': 'side-project', 'Personal Interest': 'personal-interest',
    'Video': 'video', 'Research Paper': 'research-paper',
    'Blog Post': 'blog-post', 'Article': 'article'
  };
  return maps[selectField.name] || selectField.name.toLowerCase();
}

function getCategoryName(category) {
  const map = {
    'research-papers': 'Research Papers', 'blog-posts': 'Blog Posts',
    'videos': 'Videos', 'documentation': 'Documentation',
    'articles': 'Articles', 'tutorials': 'Tutorials',
    'tools': 'Tools', 'other': 'Other'
  };
  return map[category] || 'Other';
}

function getStatusName(status) {
  const map = {
    'to-read': 'To Read', 'reading': 'Reading',
    'completed': 'Completed', 'reference': 'Reference'
  };
  return map[status] || 'To Read';
}

function getTypeName(type) {
  const map = {
    'video': 'Video', 'research-paper': 'Research Paper',
    'blog-post': 'Blog Post', 'documentation': 'Documentation',
    'article': 'Article'
  };
  return map[type] || 'Article';
}

function getWorkAreaName(workArea) {
  const map = {
    'work': 'Work', 'lab': 'Lab',
    'side-project': 'Side Project', 'personal-interest': 'Personal Interest'
  };
  return map[workArea] || 'Personal Interest';
}
