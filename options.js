// Options page for Notion Paper Saver v2.0
document.addEventListener('DOMContentLoaded', async () => {

  // ============================================================
  // DOM REFERENCES
  // ============================================================
  const settingsForm         = document.getElementById('settingsForm');
  const notionTokenInput     = document.getElementById('notionToken');
  const databaseIdInput      = document.getElementById('databaseId');
  const showIndicatorCheck   = document.getElementById('showIndicator');
  const autoSaveCheck        = document.getElementById('autoSave');
  const testConnectionBtn    = document.getElementById('testConnectionBtn');
  const findDatabaseBtn      = document.getElementById('findDatabaseBtn');
  const createTemplateBtn    = document.getElementById('createTemplateBtn');
  const statusMessage        = document.getElementById('statusMessage');
  const databaseList         = document.getElementById('databaseList');
  const databasesContainer   = document.getElementById('databases');

  // Project management
  const addProjectBtn        = document.getElementById('addProjectBtn');
  const projectCards         = document.getElementById('projectCards');
  const projectEmpty         = document.getElementById('projectEmpty');
  const projectEditPanel     = document.getElementById('projectEditPanel');
  const editPanelTitle       = document.getElementById('editPanelTitle');
  const editProjectId        = document.getElementById('editProjectId');
  const editProjectName      = document.getElementById('editProjectName');
  const editProjectColor     = document.getElementById('editProjectColor');
  const editProjectIcon      = document.getElementById('editProjectIcon');
  const editProjectDbId      = document.getElementById('editProjectDbId');
  const editDefaultCategory  = document.getElementById('editDefaultCategory');
  const editDefaultWorkArea  = document.getElementById('editDefaultWorkArea');
  const cancelEditProjectBtn = document.getElementById('cancelEditProjectBtn');
  const testProjectConnBtn   = document.getElementById('testProjectConnectionBtn');
  const saveProjectBtn       = document.getElementById('saveProjectBtn');
  const panelStatus          = document.getElementById('panelStatus');
  const migrationNotice      = document.getElementById('migrationNotice');
  const importLegacyBtn      = document.getElementById('importLegacyBtn');

  // Create DB sub-form
  const newDbNameInput       = document.getElementById('newDbName');
  const parentPageInput      = document.getElementById('parentPageInput');
  const pickParentPageBtn    = document.getElementById('pickParentPageBtn');
  const createDbBtn          = document.getElementById('createDbBtn');
  const createDbStatus       = document.getElementById('createDbStatus');

  // Page picker
  const pagePicker           = document.getElementById('pagePicker');
  const pagePickerList       = document.getElementById('pagePickerList');
  const pagePickerLoading    = document.getElementById('pagePickerLoading');
  const pagePickerEmpty      = document.getElementById('pagePickerEmpty');
  const closePagePickerBtn   = document.getElementById('closePagePickerBtn');

  // ============================================================
  // INIT
  // ============================================================
  await loadSettings();
  await renderProjectSection();
  await checkLegacyMigration();

  // ============================================================
  // EVENT LISTENERS - Settings form
  // ============================================================
  settingsForm.addEventListener('submit', handleSaveSettings);
  testConnectionBtn.addEventListener('click', handleTestConnection);
  findDatabaseBtn.addEventListener('click', handleFindDatabases);
  createTemplateBtn.addEventListener('click', handleCreateTemplate);

  // ============================================================
  // EVENT LISTENERS - Project management
  // ============================================================
  addProjectBtn.addEventListener('click', () => openEditPanel(null));
  cancelEditProjectBtn.addEventListener('click', closeEditPanel);
  saveProjectBtn.addEventListener('click', handleSaveProject);
  testProjectConnBtn.addEventListener('click', handleTestProjectConnection);
  importLegacyBtn.addEventListener('click', handleImportLegacy);

  createDbBtn.addEventListener('click', handleCreateDb);
  pickParentPageBtn.addEventListener('click', handlePickParentPage);
  closePagePickerBtn.addEventListener('click', () => { pagePicker.style.display = 'none'; });

  // Show/hide create DB sub-form based on whether DB ID is empty
  editProjectDbId.addEventListener('input', () => {
    const subform = document.getElementById('createDbSubform');
    subform.style.display = editProjectDbId.value.trim() ? 'none' : 'block';
  });

  // ============================================================
  // SETTINGS LOAD / SAVE
  // ============================================================

  async function loadSettings() {
    try {
      const settings = await chrome.storage.sync.get([
        'notionToken', 'databaseId', 'autoSave', 'showIndicator'
      ]);
      if (settings.notionToken) notionTokenInput.value = settings.notionToken;
      if (settings.databaseId) databaseIdInput.value = settings.databaseId;
      autoSaveCheck.checked      = settings.autoSave || false;
      showIndicatorCheck.checked = settings.showIndicator !== false;
    } catch (error) {
      console.error('Error loading settings:', error);
      showStatus('Error loading settings', 'error');
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();

    const settings = {
      notionToken:   notionTokenInput.value.trim(),
      databaseId:    databaseIdInput.value.trim(),
      autoSave:      autoSaveCheck.checked,
      showIndicator: showIndicatorCheck.checked
    };

    if (!settings.notionToken) {
      showStatus('Please enter your Notion integration token', 'error');
      notionTokenInput.focus();
      return;
    }

    if (!settings.notionToken.startsWith('secret_') && !settings.notionToken.startsWith('ntn_')) {
      showStatus('Invalid token format. Token should start with "secret_" or "ntn_"', 'error');
      return;
    }

    try {
      showStatus('Saving...', 'loading');
      await chrome.storage.sync.set(settings);
      showStatus('Settings saved! 🎉', 'success');
    } catch (error) {
      showStatus('Error saving settings. Please try again.', 'error');
    }
  }

  async function handleTestConnection() {
    const token      = notionTokenInput.value.trim();
    const databaseId = databaseIdInput.value.trim();

    if (!token || !databaseId) {
      showStatus('Please enter both token and database ID first', 'error');
      return;
    }

    testConnectionBtn.classList.add('loading');
    showStatus('Testing connection...', 'loading');

    try {
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (response.ok) {
        const db = await response.json();
        const title = db.title?.[0]?.text?.content || 'Untitled';
        showStatus(`✅ Connected to "${title}"`, 'success');
      } else {
        const error = await response.json();
        showStatus(`❌ ${error.message}`, 'error');
      }
    } catch (error) {
      showStatus('❌ Connection failed. Check your token and database ID.', 'error');
    } finally {
      testConnectionBtn.classList.remove('loading');
    }
  }

  async function handleFindDatabases() {
    const token = notionTokenInput.value.trim();
    if (!token) {
      showStatus('Please enter your Notion token first', 'error');
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
        body: JSON.stringify({ filter: { property: 'object', value: 'database' } })
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
      const item = document.createElement('div');
      item.className = 'database-item';
      item.innerHTML = `
        <div class="database-title">${escapeHtml(db.title[0]?.text?.content || 'Untitled Database')}</div>
        <div class="database-id">${db.id}</div>
      `;
      item.addEventListener('click', () => {
        document.querySelectorAll('.database-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        databaseIdInput.value = db.id;
        showStatus('Database selected!', 'success');
      });
      databasesContainer.appendChild(item);
    });
    databaseList.style.display = 'block';
  }

  // Fixed handleCreateTemplate - removes the broken workspace:true fallback
  async function handleCreateTemplate() {
    const token = notionTokenInput.value.trim();
    if (!token) {
      showStatus('Please enter your Notion token first', 'error');
      return;
    }

    createTemplateBtn.classList.add('loading');
    showStatus('Searching for accessible pages...', 'loading');

    try {
      const pagesResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({ filter: { property: 'object', value: 'page' } })
      });

      let parentPageId = null;
      if (pagesResponse.ok) {
        const pagesData = await pagesResponse.json();
        if (pagesData.results.length > 0) {
          parentPageId = pagesData.results[0].id;
        }
      }

      if (!parentPageId) {
        showStatus(
          '❌ No accessible pages found. In Notion, open a page → click "..." → "Add connections" → select your integration. Then try again.',
          'error'
        );
        return;
      }

      showStatus('Creating database...', 'loading');

      // Use background.js to create the database (it has the schema)
      const result = await chrome.runtime.sendMessage({
        action: 'createNotionDatabase',
        token,
        parentPageId,
        dbName: 'Paper Saver Collection',
        icon: '📚'
      });

      if (result.success) {
        databaseIdInput.value = result.databaseId;
        showStatus('✅ Template database created! Database ID has been filled in.', 'success');
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
      createTemplateBtn.classList.remove('loading');
    }
  }

  // ============================================================
  // PROJECT SECTION
  // ============================================================

  async function renderProjectSection() {
    const response = await chrome.runtime.sendMessage({ action: 'getProjects' });
    const { projects = [], activeProjectId } = response || {};

    projectCards.querySelectorAll('.project-card').forEach(c => c.remove());

    if (projects.length === 0) {
      projectEmpty.style.display = 'block';
      return;
    }

    projectEmpty.style.display = 'none';

    projects.forEach(project => {
      const card = createProjectCard(project, project.id === activeProjectId);
      projectCards.insertBefore(card, projectEmpty);
    });
  }

  function createProjectCard(project, isActive) {
    const card = document.createElement('div');
    card.className = 'project-card' + (isActive ? ' active-card' : '');
    card.dataset.projectId = project.id;

    const shortDbId = project.databaseId
      ? project.databaseId.substring(0, 8) + '...' + project.databaseId.slice(-4)
      : 'No database';

    const defaultsText = [
      project.defaultCategory ? getCategoryDisplayName(project.defaultCategory) : '',
      project.defaultWorkArea ? getWorkAreaDisplayName(project.defaultWorkArea) : ''
    ].filter(Boolean).join(' · ');

    card.innerHTML = `
      <span class="project-card-dot" style="background: ${project.color || '#667eea'}"></span>
      <div class="project-card-info">
        <div class="project-card-name">
          ${project.icon ? escapeHtml(project.icon) + ' ' : ''}${escapeHtml(project.name)}
          ${isActive ? '<span class="project-card-active-badge">Active</span>' : ''}
        </div>
        <div class="project-card-db">${escapeHtml(shortDbId)}</div>
        ${defaultsText ? `<div class="project-card-defaults">${escapeHtml(defaultsText)}</div>` : ''}
      </div>
      <div class="project-card-actions">
        ${!isActive ? `<button class="card-btn set-active-btn" data-id="${project.id}">Set Active</button>` : ''}
        <button class="card-btn edit-btn" data-id="${project.id}">Edit</button>
        <button class="card-btn delete-btn" data-id="${project.id}">Delete</button>
      </div>
    `;

    card.querySelector('.edit-btn').addEventListener('click', () => openEditPanel(project));

    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Delete project "${project.name}"? This does not delete your Notion database.`)) {
        const result = await chrome.runtime.sendMessage({
          action: 'deleteProject',
          projectId: project.id
        });
        if (result.success) await renderProjectSection();
        else showStatus('Failed to delete project', 'error');
      }
    });

    const setActiveBtn = card.querySelector('.set-active-btn');
    if (setActiveBtn) {
      setActiveBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'setActiveProject', projectId: project.id });
        await renderProjectSection();
      });
    }

    return card;
  }

  function openEditPanel(project) {
    editPanelTitle.textContent = project ? 'Edit Project' : 'New Project';
    editProjectId.value        = project?.id || '';
    editProjectName.value      = project?.name || '';
    editProjectColor.value     = project?.color || '#667eea';
    editProjectIcon.value      = project?.icon || '';
    editProjectDbId.value      = project?.databaseId || '';
    editDefaultCategory.value  = project?.defaultCategory || '';
    editDefaultWorkArea.value  = project?.defaultWorkArea || '';
    newDbNameInput.value       = '';
    parentPageInput.value      = '';

    // Show/hide create-db sub-form
    const subform = document.getElementById('createDbSubform');
    subform.style.display = (project?.databaseId) ? 'none' : 'block';

    hidePanelStatus();
    hideCreateDbStatus();
    projectEditPanel.style.display = 'block';
    projectEditPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    editProjectName.focus();
  }

  function closeEditPanel() {
    projectEditPanel.style.display = 'none';
    hidePanelStatus();
  }

  async function handleSaveProject() {
    const name      = editProjectName.value.trim();
    const databaseId = editProjectDbId.value.trim();
    const id        = editProjectId.value;

    if (!name) {
      showPanelStatus('Please enter a project name', 'error');
      editProjectName.focus();
      return;
    }

    if (!databaseId) {
      showPanelStatus('Please enter a database ID or create a new database first', 'error');
      return;
    }

    const projectData = {
      name,
      databaseId: normalizeDbId(databaseId),
      color:             editProjectColor.value,
      icon:              editProjectIcon.value.trim(),
      defaultCategory:   editDefaultCategory.value,
      defaultWorkArea:   editDefaultWorkArea.value
    };

    try {
      let result;
      if (id) {
        result = await chrome.runtime.sendMessage({
          action: 'updateProject',
          project: { id, ...projectData }
        });
      } else {
        result = await chrome.runtime.sendMessage({
          action: 'createProject',
          project: projectData
        });
      }

      if (result.success) {
        closeEditPanel();
        await renderProjectSection();
        showStatus(id ? 'Project updated! ✓' : 'Project created! ✓', 'success');
      } else {
        showPanelStatus(`Error: ${result.error}`, 'error');
      }
    } catch (e) {
      showPanelStatus('Failed to save project', 'error');
    }
  }

  async function handleTestProjectConnection() {
    const token     = notionTokenInput.value.trim();
    const dbId      = editProjectDbId.value.trim();

    if (!token) {
      showPanelStatus('Enter your Notion token in the API Token section first', 'error');
      return;
    }
    if (!dbId) {
      showPanelStatus('Enter a database ID first', 'error');
      return;
    }

    testProjectConnBtn.disabled = true;
    showPanelStatus('Testing...', 'loading');

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'testConnection',
        token,
        databaseId: dbId
      });

      if (result.success) {
        showPanelStatus(`✅ Connected to "${result.dbTitle}"`, 'success');
      } else {
        showPanelStatus(`❌ ${result.error}`, 'error');
      }
    } catch (e) {
      showPanelStatus('Connection test failed', 'error');
    } finally {
      testProjectConnBtn.disabled = false;
    }
  }

  async function handleCreateDb() {
    const token = notionTokenInput.value.trim();
    if (!token) {
      showCreateDbStatus('Enter your Notion token in the API Token section first', 'error');
      return;
    }

    const parentInput = parentPageInput.value.trim();
    if (!parentInput) {
      showCreateDbStatus('Enter or pick a parent Notion page', 'error');
      return;
    }

    const dbName = newDbNameInput.value.trim() ||
                   (editProjectName.value.trim() + ' Collection') ||
                   'Paper Saver Collection';

    createDbBtn.disabled = true;
    showCreateDbStatus('Creating database...', 'loading');

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'createNotionDatabase',
        token,
        parentPageId: parentInput,
        dbName,
        icon: editProjectIcon.value.trim() || undefined
      });

      if (result.success) {
        editProjectDbId.value = result.databaseId;
        showCreateDbStatus(`✅ Database created! ID filled in above.`, 'success');
        // Hide create-db subform since we now have an ID
        document.getElementById('createDbSubform').style.display = 'none';
      } else {
        showCreateDbStatus(`❌ ${result.error}`, 'error');
      }
    } catch (e) {
      showCreateDbStatus('Failed to create database', 'error');
    } finally {
      createDbBtn.disabled = false;
    }
  }

  async function handlePickParentPage() {
    const token = notionTokenInput.value.trim();
    if (!token) {
      showCreateDbStatus('Enter your Notion token first', 'error');
      return;
    }

    pagePicker.style.display = 'block';
    pagePickerLoading.style.display = 'block';
    pagePickerList.innerHTML = '';
    pagePickerEmpty.style.display = 'none';

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'findNotionPages',
        token
      });

      pagePickerLoading.style.display = 'none';

      if (!result.success) {
        pagePickerEmpty.style.display = 'block';
        pagePickerEmpty.textContent = 'Error: ' + result.error;
        return;
      }

      const pages = result.pages || [];
      if (pages.length === 0) {
        pagePickerEmpty.style.display = 'block';
        return;
      }

      pages.forEach(page => {
        const item = document.createElement('div');
        item.className = 'page-picker-item';
        item.textContent = page.title;
        item.addEventListener('click', () => {
          parentPageInput.value = page.id;
          pagePicker.style.display = 'none';
        });
        pagePickerList.appendChild(item);
      });

    } catch (e) {
      pagePickerLoading.style.display = 'none';
      pagePickerEmpty.style.display = 'block';
    }
  }

  // ============================================================
  // LEGACY MIGRATION
  // ============================================================

  async function checkLegacyMigration() {
    try {
      const [syncData, localData] = await Promise.all([
        chrome.storage.sync.get(['databaseId']),
        chrome.storage.local.get(['projects', 'migrated'])
      ]);

      // Show migration notice if legacy config exists but no projects yet
      if (syncData.databaseId && !localData.migrated && (!localData.projects || localData.projects.length === 0)) {
        migrationNotice.style.display = 'flex';
      }
    } catch (e) {
      console.error('Migration check error:', e);
    }
  }

  async function handleImportLegacy() {
    try {
      const [syncData, localData] = await Promise.all([
        chrome.storage.sync.get(['databaseId', 'defaultCategory', 'defaultWorkArea']),
        chrome.storage.local.get(['savedPages'])
      ]);

      if (!syncData.databaseId) {
        showStatus('No legacy database ID found', 'error');
        return;
      }

      const result = await chrome.runtime.sendMessage({
        action: 'createProject',
        project: {
          name: 'My Reading List',
          databaseId: syncData.databaseId,
          color: '#667eea',
          icon: '📚',
          defaultCategory: syncData.defaultCategory || '',
          defaultWorkArea: syncData.defaultWorkArea || ''
        }
      });

      if (result.success) {
        // Mark migrated and set active project
        await chrome.storage.local.set({ migrated: true });
        await chrome.runtime.sendMessage({ action: 'setActiveProject', projectId: result.project.id });

        migrationNotice.style.display = 'none';
        await renderProjectSection();
        showStatus('Legacy config imported as "My Reading List" project!', 'success');
      } else {
        showStatus('Import failed: ' + result.error, 'error');
      }
    } catch (e) {
      showStatus('Import failed', 'error');
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function normalizeDbId(input) {
    if (!input) return '';
    const clean = input.trim().replace(/-/g, '');
    if (/^[a-f0-9]{32}$/i.test(clean)) {
      return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
    }
    return input.trim();
  }

  function getCategoryDisplayName(c) {
    return {
      'research-papers': 'Research Papers', 'blog-posts': 'Blog Posts',
      'videos': 'Videos', 'documentation': 'Documentation',
      'articles': 'Articles', 'tutorials': 'Tutorials',
      'tools': 'Tools', 'other': 'Other'
    }[c] || c;
  }

  function getWorkAreaDisplayName(w) {
    return {
      'work': 'Work', 'lab': 'Lab',
      'side-project': 'Side Project', 'personal-interest': 'Personal Interest'
    }[w] || w;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    if (type === 'success' || type === 'error') {
      setTimeout(() => { statusMessage.style.display = 'none'; }, 5000);
    }
  }

  function showPanelStatus(message, type) {
    panelStatus.textContent = message;
    panelStatus.className = `panel-status ${type}`;
    panelStatus.style.display = 'block';
    if (type === 'success' || type === 'error') {
      setTimeout(() => { panelStatus.style.display = 'none'; }, 4000);
    }
  }

  function hidePanelStatus() {
    panelStatus.style.display = 'none';
  }

  function showCreateDbStatus(message, type) {
    createDbStatus.textContent = message;
    createDbStatus.className = `create-db-status ${type}`;
    createDbStatus.style.display = 'block';
  }

  function hideCreateDbStatus() {
    createDbStatus.style.display = 'none';
  }
});
