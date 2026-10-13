// Popup script for Notion Paper Saver v2.0
document.addEventListener('DOMContentLoaded', async () => {

  // ============================================================
  // DOM REFERENCES
  // ============================================================
  const pageTitle    = document.getElementById('pageTitle');
  const pageUrl      = document.getElementById('pageUrl');
  const contentType  = document.getElementById('contentType');
  const saveForm     = document.getElementById('saveForm');
  const saveBtn      = document.getElementById('saveBtn');
  const quickSaveBtn = document.getElementById('quickSaveBtn');
  const statusMsg    = document.getElementById('statusMessage');
  const settingsBtn  = document.getElementById('settingsBtn');
  const refreshTitleBtn = document.getElementById('refreshTitleBtn');
  const dupWarning   = document.getElementById('duplicateWarning');
  const dupDate      = document.getElementById('duplicateDate');
  const viewExistingBtn   = document.getElementById('viewExistingBtn');
  const updateExistingBtn = document.getElementById('updateExistingBtn');
  const saveAnywayBtn     = document.getElementById('saveAnywayBtn');
  const currentValuesDiv  = document.getElementById('currentValues');
  const currentStatus     = document.getElementById('currentStatus');
  const currentCategory   = document.getElementById('currentCategory');
  const currentWorkArea   = document.getElementById('currentWorkArea');
  const highlightGroup    = document.getElementById('highlightGroup');
  const highlightPreview  = document.getElementById('highlightPreview');

  // ============================================================
  // STATE
  // ============================================================
  let currentDuplicateInfo = null;
  let allowDuplicateSave   = false;
  let isUpdateMode         = false;
  let tab                  = null;
  let projectsCache        = null;  // getProjects response, shared by loadProjects and Quick save
  let pendingDefaults      = null;  // project/legacy category + work area, applied after page info
  let contentScriptReady   = null;  // promise for content.js injection (injected once per popup)

  // ============================================================
  // INIT
  // ============================================================

  // 1. Get current tab
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 2. Load projects first so window.currentProjectId is set before duplicate checks
  await loadProjects();

  // 3. Extract page info + selected text in a single script execution
  try {
    await ensureContentScript();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const pageInfo = window.extractPageInfo ? window.extractPageInfo() : null;
        const selectedText = window.getSelection()?.toString().trim() || '';
        return { pageInfo, selectedText };
      }
    });

    const { pageInfo, selectedText } = results[0]?.result || {};

    if (pageInfo) {
      displayPageInfo(pageInfo);
      await checkForDuplicates(pageInfo.url);
    } else {
      pageTitle.textContent = tab.title || 'Unknown page';
      pageUrl.textContent = tab.url || '';
    }

    // Show highlight section if text was selected
    if (selectedText && selectedText.length > 0 && selectedText.length <= 2000) {
      highlightPreview.textContent = selectedText;
      highlightGroup.style.display = 'block';
    }

  } catch (error) {
    console.error('Error extracting page info:', error);
    pageTitle.textContent = tab.title || 'Unknown page';
    pageUrl.textContent = tab.url || '';
    allowDuplicateSave = true;
  }

  // 4. Apply project defaults after page info, so the detected content type wins
  applyProjectDefaults();

  // 5. Try enrichment (non-blocking)
  tryEnrichment();

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  saveForm.addEventListener('submit', handleSave);
  quickSaveBtn.addEventListener('click', handleQuickSave);
  settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  refreshTitleBtn.addEventListener('click', handleRefreshTitle);
  viewExistingBtn.addEventListener('click', handleViewExisting);
  updateExistingBtn.addEventListener('click', handleUpdateExisting);
  saveAnywayBtn.addEventListener('click', handleSaveAnyway);

  // Project bar toggle
  const projectActive = document.getElementById('projectActive');
  projectActive.addEventListener('click', (e) => {
    e.stopPropagation();
    setProjectDropdown(document.getElementById('projectDropdown').style.display === 'none');
  });
  projectActive.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      projectActive.click();
    }
  });

  // Keyboard navigation inside the open project dropdown
  document.getElementById('projectBar').addEventListener('keydown', (e) => {
    if (document.getElementById('projectDropdown').style.display === 'none') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      setProjectDropdown(false);
      projectActive.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = projectItems();
      const idx = items.indexOf(document.activeElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = idx === -1
        ? (step > 0 ? 0 : items.length - 1)
        : (idx + step + items.length) % items.length;
      items[next]?.focus();
    }
  });

  // Close project dropdown when clicking outside
  document.addEventListener('click', () => setProjectDropdown(false));

  document.getElementById('manageProjectsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ============================================================
  // PROJECT BAR
  // ============================================================

  // Inject content.js on demand (it is no longer auto-injected on every page).
  // Injection is idempotent, so it runs once per popup and the promise is reused.
  function ensureContentScript() {
    if (!contentScriptReady) {
      contentScriptReady = chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }
    return contentScriptReady;
  }

  function setProjectDropdown(open) {
    document.getElementById('projectDropdown').style.display = open ? 'block' : 'none';
    document.getElementById('projectBar').classList.toggle('open', open);
    projectActive.setAttribute('aria-expanded', String(open));
  }

  function projectItems() {
    return [...document.querySelectorAll('#projectList .project-item')];
  }

  // Applied after page info is displayed. Project defaults only fill empty fields,
  // so the detected content type and duplicate values win; legacy defaults overwrite.
  function applyProjectDefaults() {
    if (!pendingDefaults) return;
    const { overwrite, category, workArea } = pendingDefaults;
    const categorySelect = document.getElementById('category');
    const workAreaSelect = document.getElementById('workArea');
    if (category && (overwrite || !categorySelect.value)) categorySelect.value = category;
    if (workArea && (overwrite || !workAreaSelect.value)) workAreaSelect.value = workArea;
  }

  async function loadProjects() {
    try {
      const syncData = await chrome.storage.sync.get(['notionToken']);
      if (!syncData.notionToken) {
        showStatus('Please configure your Notion integration in settings', 'error');
        saveBtn.disabled = true;
        quickSaveBtn.disabled = true;
      }

      const response = await chrome.runtime.sendMessage({ action: 'getProjects' });
      projectsCache = response || {};
      const { projects, activeProjectId } = projectsCache;

      if (!projects || projects.length === 0) {
        document.getElementById('projectName').textContent = 'No project — set up in Settings';
        document.getElementById('projectDot').style.background = '#ccc';
        // Fall back to legacy sync defaults (applied after page info)
        const settings = await chrome.storage.sync.get(['defaultCategory', 'defaultWorkArea']);
        pendingDefaults = { overwrite: true, category: settings.defaultCategory, workArea: settings.defaultWorkArea };
        return;
      }

      const active = projects.find(p => p.id === activeProjectId) || projects[0];
      window.currentProjectId = active.id;
      renderProjectBar(active, projects);
      pendingDefaults = { overwrite: false, category: active.defaultCategory, workArea: active.defaultWorkArea };

    } catch (error) {
      console.error('Error loading projects:', error);
      document.getElementById('projectName').textContent = 'Error loading projects';
    }
  }

  function renderProjectBar(activeProject, allProjects) {
    const dot  = document.getElementById('projectDot');
    const name = document.getElementById('projectName');
    dot.style.background = activeProject.color || '#667eea';
    name.textContent = (activeProject.icon ? activeProject.icon + ' ' : '') + activeProject.name;

    const list = document.getElementById('projectList');
    list.innerHTML = '';
    allProjects.forEach(project => {
      const item = document.createElement('div');
      item.className = 'project-item' + (project.id === activeProject.id ? ' active' : '');

      const itemDot = document.createElement('span');
      itemDot.className = 'project-item-dot';
      itemDot.style.background = project.color || '#667eea';

      const itemName = document.createElement('span');
      itemName.className = 'project-item-name';
      itemName.textContent = (project.icon ? project.icon + ' ' : '') + project.name;

      item.appendChild(itemDot);
      item.appendChild(itemName);

      if (project.id === activeProject.id) {
        const check = document.createElement('span');
        check.className = 'project-item-check';
        check.textContent = '✓';
        item.appendChild(check);
      }

      item.setAttribute('role', 'option');
      item.tabIndex = 0;
      item.setAttribute('aria-selected', String(project.id === activeProject.id));

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        handleProjectSwitch(project, allProjects);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleProjectSwitch(project, allProjects);
        }
      });
      list.appendChild(item);
    });
  }

  async function handleProjectSwitch(project, allProjects) {
    await chrome.runtime.sendMessage({ action: 'setActiveProject', projectId: project.id });
    window.currentProjectId = project.id;
    if (projectsCache) projectsCache.activeProjectId = project.id;

    renderProjectBar(project, allProjects);

    // Close dropdown and return focus to the project button
    setProjectDropdown(false);
    projectActive.focus();

    // Apply new project defaults
    if (project.defaultCategory) document.getElementById('category').value = project.defaultCategory;
    if (project.defaultWorkArea) document.getElementById('workArea').value = project.defaultWorkArea;

    // Re-check duplicates against the new project's database
    if (window.currentPageData) {
      await checkForDuplicates(window.currentPageData.url);
    }
  }

  // ============================================================
  // ENRICHMENT
  // ============================================================

  async function tryEnrichment() {
    if (!tab) return;
    try {
      await ensureContentScript();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getEnrichedPageInfo ? window.getEnrichedPageInfo() : null
      });
      const enriched = results[0]?.result;
      if (!enriched) return;

      const tagsInput = document.getElementById('tags');
      if (enriched.suggestedTags && enriched.suggestedTags.length > 0 && !tagsInput.value) {
        tagsInput.value = enriched.suggestedTags.join(', ');
        tagsInput.style.borderColor = '#28a745';
        setTimeout(() => { tagsInput.style.borderColor = ''; }, 2000);
      }

      if (window.currentPageData) {
        if (enriched.author && !window.currentPageData.author) {
          window.currentPageData.author = enriched.author;
        }
        if (enriched.description && !window.currentPageData.description) {
          window.currentPageData.description = enriched.description;
        }
        if (enriched.title) {
          // ArXiv / HuggingFace can give cleaner title
          const titleInput = document.getElementById('title');
          if (enriched.title && titleInput.value === window.currentPageData.title) {
            titleInput.value = enriched.title;
            pageTitle.textContent = enriched.title;
            window.currentPageData.title = enriched.title;
          }
        }
      }
    } catch (e) {
      // Enrichment is optional — fail silently
    }
  }

  // ============================================================
  // DISPLAY PAGE INFO
  // ============================================================

  function displayPageInfo(data) {
    pageTitle.textContent = data.title;
    pageUrl.textContent = data.url;
    document.getElementById('title').value = data.title;

    const typeMap = {
      'video':          { emoji: '🎥', text: 'Video',          color: '#ff4757' },
      'research-paper': { emoji: '📄', text: 'Research Paper', color: '#5352ed' },
      'blog-post':      { emoji: '📝', text: 'Blog Post',      color: '#ff6b35' },
      'documentation':  { emoji: '📚', text: 'Documentation',  color: '#26de81' },
      'tutorial':       { emoji: '🎓', text: 'Tutorial',       color: '#a55eea' },
      'article':        { emoji: '📰', text: 'Article',        color: '#45aaf2' }
    };
    const info = typeMap[data.type] || typeMap['article'];
    contentType.textContent = `${info.emoji} ${info.text}`;
    contentType.style.backgroundColor = info.color + '20';
    contentType.style.color = info.color;

    // Pre-select category based on detected type (will be overridden by project defaults if not set)
    const catSelect = document.getElementById('category');
    const typeToCategory = {
      'video': 'videos',
      'research-paper': 'research-papers',
      'blog-post': 'blog-posts',
      'documentation': 'documentation',
      'tutorial': 'tutorials'
    };
    if (typeToCategory[data.type]) {
      catSelect.value = typeToCategory[data.type];
    }

    window.currentPageData = data;
  }

  // ============================================================
  // SAVE HANDLER
  // ============================================================

  async function handleSave(e) {
    e.preventDefault();

    if (currentDuplicateInfo?.duplicate && !allowDuplicateSave && !isUpdateMode) {
      showStatus('Already saved. Use "Update" or "Save Anyway".', 'error');
      return;
    }

    const titleValue    = document.getElementById('title').value.trim();
    const categoryValue = document.getElementById('category').value.trim();
    const workAreaValue = document.getElementById('workArea').value.trim();

    if (!titleValue) {
      showStatus('Please enter a title', 'error');
      return;
    }

    if (!isUpdateMode) {
      if (!categoryValue) { showStatus('Please select a category', 'error'); return; }
      if (!workAreaValue)  { showStatus('Please select a work area', 'error'); return; }
    }

    const includeHighlight = document.getElementById('includeHighlight')?.checked;
    const highlightText    = highlightPreview?.textContent?.trim() || '';

    const saveData = {
      ...window.currentPageData,
      title:         titleValue,
      category:      categoryValue,
      workArea:      workAreaValue,
      tags:          document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes:         document.getElementById('notes').value.trim(),
      readingStatus: document.getElementById('readingStatus').value || 'to-read',
      priority:      document.getElementById('priority').checked,
      savedAt:       new Date().toISOString(),
      isUpdate:      isUpdateMode,
      highlight:     (includeHighlight && highlightText) ? highlightText : '',
      projectId:     window.currentProjectId || null
    };

    saveBtn.disabled = true;
    saveBtn.classList.add('loading');

    try {
      if (isUpdateMode && currentDuplicateInfo) {
        showStatus('Updating...', 'loading');
        const response = await chrome.runtime.sendMessage({
          action: 'updateToNotion',
          data: saveData,
          pageId: currentDuplicateInfo.notionPageId
        });

        if (response?.success) {
          showStatus('Updated in Notion! 🎉', 'success');
          resetState();
          setTimeout(() => window.close(), 1400);
        } else {
          showStatus(`❌ ${response?.error || 'Update failed'}`, 'error');
        }

      } else {
        showStatus('Saving...', 'loading');
        const response = await chrome.runtime.sendMessage({
          action: 'saveToNotion',
          data: saveData
        });

        if (response?.success) {
          showStatus('Saved to Notion! 🎉', 'success');
          resetState();
          setTimeout(() => window.close(), 1400);
        } else {
          showStatus(`❌ ${response?.error || 'Save failed'}`, 'error');
        }
      }
    } catch (error) {
      console.error('Save error:', error);
      showStatus('Save failed. Check your settings.', 'error');
    }

    saveBtn.disabled = false;
    saveBtn.classList.remove('loading');
  }

  // ============================================================
  // QUICK SAVE
  // ============================================================

  async function handleQuickSave() {
    if (!window.currentPageData) {
      showStatus('Page info not loaded yet', 'error');
      return;
    }

    if (currentDuplicateInfo?.duplicate && !allowDuplicateSave) {
      showStatus('Already saved. Use "Update" or "Save Anyway" first.', 'error');
      return;
    }

    let activeProject = null;
    try {
      if (!projectsCache) {
        projectsCache = (await chrome.runtime.sendMessage({ action: 'getProjects' })) || {};
      }
      const { projects, activeProjectId } = projectsCache;
      activeProject = (projects || []).find(p => p.id === activeProjectId) || (projects || [])[0];
    } catch (e) { /* use defaults */ }

    const includeHighlight = document.getElementById('includeHighlight')?.checked;
    const highlightText    = highlightPreview?.textContent?.trim() || '';

    const saveData = {
      ...window.currentPageData,
      title:         window.currentPageData.title,
      category:      activeProject?.defaultCategory || document.getElementById('category').value || 'articles',
      workArea:      activeProject?.defaultWorkArea || document.getElementById('workArea').value || 'personal-interest',
      tags:          document.getElementById('tags').value.split(',').map(t => t.trim()).filter(Boolean),
      notes:         '',
      readingStatus: 'to-read',
      priority:      false,
      savedAt:       new Date().toISOString(),
      highlight:     (includeHighlight && highlightText) ? highlightText : '',
      projectId:     window.currentProjectId || null
    };

    quickSaveBtn.disabled = true;
    showStatus('⚡ Quick saving...', 'loading');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'saveToNotion', data: saveData });

      if (response?.success) {
        showStatus('Quick saved! ⚡', 'success');
        setTimeout(() => window.close(), 1100);
      } else {
        showStatus(`❌ ${response?.error || 'Quick save failed'}`, 'error');
        quickSaveBtn.disabled = false;
      }
    } catch (error) {
      showStatus('Quick save failed. Check settings.', 'error');
      quickSaveBtn.disabled = false;
    }
  }

  // ============================================================
  // DUPLICATE DETECTION
  // ============================================================

  async function checkForDuplicates(url) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkDuplicate',
        url,
        projectId: window.currentProjectId || null
      });

      if (response?.duplicate) {
        currentDuplicateInfo = response;
        allowDuplicateSave = false;
        displayDuplicateWarning(response);
      } else {
        allowDuplicateSave = true;
        hideDuplicateWarning();
      }
    } catch (error) {
      console.error('Duplicate check error:', error);
      allowDuplicateSave = true;
      hideDuplicateWarning();
    }
  }

  function displayDuplicateWarning(info) {
    dupWarning.style.display = 'block';
    const d = new Date(info.savedAt);
    dupDate.textContent = d.toLocaleDateString() + ' at ' + d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

    if (info.currentValues) {
      currentValuesDiv.style.display = 'block';
      currentStatus.textContent   = getStatusDisplayName(info.currentValues.status);
      currentCategory.textContent = getCategoryDisplayName(info.currentValues.category);
      currentWorkArea.textContent = getWorkAreaDisplayName(info.currentValues.workArea);
      populateFormWithCurrentValues(info.currentValues);
    }

    saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17,21 17,13 7,13 7,21"></polyline>
      <polyline points="7,3 7,8 15,8"></polyline>
    </svg> ⚠️ Already Saved`;
    saveBtn.disabled = true;
    saveBtn.style.background = '#6c757d';
  }

  function hideDuplicateWarning() {
    dupWarning.style.display = 'none';
    currentValuesDiv.style.display = 'none';
    if (saveBtn.textContent.includes('Already Saved') || saveBtn.textContent.includes('Update in Notion')) {
      saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17,21 17,13 7,13 7,21"></polyline>
        <polyline points="7,3 7,8 15,8"></polyline>
      </svg> Save to Notion`;
      saveBtn.disabled = false;
      saveBtn.style.background = '';
    }
    if (isUpdateMode) resetFormLabels();
    isUpdateMode = false;
  }

  function populateFormWithCurrentValues(vals) {
    if (vals.category && !document.getElementById('category').value) {
      document.getElementById('category').value = vals.category;
    }
    if (vals.status && !document.getElementById('readingStatus').value) {
      document.getElementById('readingStatus').value = vals.status;
    }
    if (vals.workArea && !document.getElementById('workArea').value) {
      document.getElementById('workArea').value = vals.workArea;
    }
    if (vals.priority !== undefined) document.getElementById('priority').checked = vals.priority;
    if (vals.tags?.length > 0 && !document.getElementById('tags').value) {
      document.getElementById('tags').value = vals.tags.join(', ');
    }
  }

  // ============================================================
  // DUPLICATE ACTION HANDLERS
  // ============================================================

  function handleViewExisting() {
    const url = currentDuplicateInfo?.notionUrl ||
                (currentDuplicateInfo?.notionPageId
                  ? `https://notion.so/${currentDuplicateInfo.notionPageId.replace(/-/g, '')}`
                  : null);
    if (url) chrome.tabs.create({ url });
    else showStatus('Cannot find the existing page URL', 'error');
  }

  function handleUpdateExisting() {
    isUpdateMode = true;
    allowDuplicateSave = false;

    updateFormLabelsForUpdate();

    saveBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M3 21v-5h5"/>
    </svg> Update in Notion`;
    saveBtn.disabled = false;
    saveBtn.style.background = '#28a745';
    dupWarning.style.display = 'none';

    const currentTitle = document.getElementById('title').value.trim();
    showStatus(
      shouldUpdateTitle(currentTitle)
        ? 'Update mode — modify fields and click "Update in Notion". Empty = keep current.'
        : `Update mode — title "${currentTitle}" won't change (fallback value).`,
      'success'
    );
  }

  function handleSaveAnyway() {
    allowDuplicateSave = true;
    isUpdateMode = false;
    hideDuplicateWarning();
    showStatus('You can now save this page again.', 'success');
  }

  function updateFormLabelsForUpdate() {
    const categorySelect = document.getElementById('category');
    const workAreaSelect = document.getElementById('workArea');

    document.querySelector('label[for="category"]').innerHTML =
      'Category <small style="color:#888;font-weight:normal;">(optional)</small>';
    categorySelect.querySelector('option[value=""]').textContent = 'Keep current';
    categorySelect.querySelector('option[value="keep-current"]').style.display = 'block';
    categorySelect.removeAttribute('required');

    document.querySelector('label[for="workArea"]').innerHTML =
      'Work Area <small style="color:#888;font-weight:normal;">(optional)</small>';
    workAreaSelect.querySelector('option[value=""]').textContent = 'Keep current';
    workAreaSelect.querySelector('option[value="keep-current"]').style.display = 'block';
    workAreaSelect.removeAttribute('required');

    document.querySelector('label[for="readingStatus"]').innerHTML =
      'Reading Status <small style="color:#888;font-weight:normal;">(keep as-is to preserve)</small>';
  }

  function resetFormLabels() {
    const categorySelect = document.getElementById('category');
    const workAreaSelect = document.getElementById('workArea');

    document.querySelector('label[for="category"]').textContent = 'Category';
    categorySelect.querySelector('option[value=""]').textContent = 'Select a category...';
    categorySelect.querySelector('option[value="keep-current"]').style.display = 'none';
    categorySelect.setAttribute('required', '');

    document.querySelector('label[for="workArea"]').textContent = 'Work Area';
    workAreaSelect.querySelector('option[value=""]').textContent = 'Select work area...';
    workAreaSelect.querySelector('option[value="keep-current"]').style.display = 'none';
    workAreaSelect.setAttribute('required', '');

    document.querySelector('label[for="readingStatus"]').textContent = 'Reading Status';
  }

  function resetState() {
    allowDuplicateSave = false;
    currentDuplicateInfo = null;
    isUpdateMode = false;
    hideDuplicateWarning();
  }

  // ============================================================
  // REFRESH TITLE
  // ============================================================

  async function handleRefreshTitle() {
    refreshTitleBtn.style.opacity = '0.5';
    refreshTitleBtn.style.pointerEvents = 'none';
    try {
      await ensureContentScript();
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.extractPageInfo ? window.extractPageInfo() : null
      });
      const pageData = results[0]?.result;
      if (pageData) {
        document.getElementById('title').value = pageData.title;
        await checkForDuplicates(pageData.url);
      }
    } catch (error) {
      showStatus('Failed to refresh title', 'error');
    } finally {
      refreshTitleBtn.style.opacity = '1';
      refreshTitleBtn.style.pointerEvents = 'auto';
    }
  }

  // ============================================================
  // STATUS / DISPLAY HELPERS
  // ============================================================

  function showStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = `status-message ${type}`;
    statusMsg.style.display = 'block';
    if (type === 'success' || type === 'error') {
      setTimeout(() => { statusMsg.style.display = 'none'; }, 3500);
    }
  }

  function shouldUpdateTitle(title) {
    if (!title || typeof title !== 'string') return false;
    const skip = ['Untitled Page', 'Untitled', 'Loading...', 'Page not found', '404', 'Error', ''];
    return !skip.includes(title.trim());
  }

  function getStatusDisplayName(s) {
    return { 'to-read': 'To Read', 'reading': 'Reading', 'completed': 'Completed', 'reference': 'Reference' }[s] || s;
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
    return { 'work': 'Work', 'lab': 'Lab', 'side-project': 'Side Project', 'personal-interest': 'Personal Interest' }[w] || w;
  }
});
