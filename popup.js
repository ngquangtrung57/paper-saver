// Popup functionality for Notion Paper Saver
document.addEventListener('DOMContentLoaded', async () => {
  const pageInfo = document.getElementById('pageInfo');
  const pageTitle = document.getElementById('pageTitle');
  const pageUrl = document.getElementById('pageUrl');
  const contentType = document.getElementById('contentType');
  const saveForm = document.getElementById('saveForm');
  const saveBtn = document.getElementById('saveBtn');
  const statusMessage = document.getElementById('statusMessage');
  const settingsBtn = document.getElementById('settingsBtn');
  const refreshTitleBtn = document.getElementById('refreshTitleBtn');
  const duplicateWarning = document.getElementById('duplicateWarning');
  const duplicateDate = document.getElementById('duplicateDate');
  const viewExistingBtn = document.getElementById('viewExistingBtn');
  const updateExistingBtn = document.getElementById('updateExistingBtn');
  const saveAnywayBtn = document.getElementById('saveAnywayBtn');
  const currentValues = document.getElementById('currentValues');
  const currentStatus = document.getElementById('currentStatus');
  const currentCategory = document.getElementById('currentCategory');
  const currentWorkArea = document.getElementById('currentWorkArea');

  // State variables
  let currentDuplicateInfo = null;
  let allowDuplicateSave = false;
  let isUpdateMode = false;

  // Get current tab information
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Extract page information
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageInfo
    });
    
    const pageData = results[0].result;
    displayPageInfo(pageData);
    
    // Check for duplicates after page info is loaded
    await checkForDuplicates(pageData.url);
  } catch (error) {
    console.error('Error extracting page info:', error);
    pageTitle.textContent = tab.title || 'Unknown page';
    pageUrl.textContent = tab.url || '';
  }

  // Load saved settings
  loadUserPreferences();

  // Event listeners
  saveForm.addEventListener('submit', handleSave);
  settingsBtn.addEventListener('click', openSettings);
  refreshTitleBtn.addEventListener('click', handleRefreshTitle);
  viewExistingBtn.addEventListener('click', handleViewExisting);
  updateExistingBtn.addEventListener('click', handleUpdateExisting);
  saveAnywayBtn.addEventListener('click', handleSaveAnyway);

  // Helper function to clean up titles
  function cleanTitle(title) {
    if (!title) return 'Untitled Page';
    
    // Remove common site suffixes and prefixes
    const commonPatterns = [
      / - YouTube$/,
      / \| YouTube$/,
      / - Medium$/,
      / \| Medium$/,
      / - ArXiv$/,
      / \| ArXiv$/,
      / - Wikipedia$/,
      / \| Wikipedia$/,
      / - GitHub$/,
      / \| GitHub$/,
      / - Stack Overflow$/,
      / \| Stack Overflow$/,
      / - Reddit$/,
      / \| Reddit$/,
      /^(\([^)]+\)\s*)?/, // Remove prefixes like "(PDF)" or "(Video)"
      /\s*[\|\-]\s*[^|\-]*$/ // Remove generic " - SiteName" or " | SiteName" at end
    ];
    
    let cleanedTitle = title.trim();
    
    // Apply cleaning patterns
    for (const pattern of commonPatterns.slice(0, -2)) { // Apply specific patterns first
      cleanedTitle = cleanedTitle.replace(pattern, '');
    }
    
    // Only apply generic pattern if title is still long enough
    if (cleanedTitle.length > 50) {
      cleanedTitle = cleanedTitle.replace(/\s*[\|\-]\s*[^|\-]*$/, '');
    }
    
    // Clean up extra whitespace and ensure reasonable length
    cleanedTitle = cleanedTitle.trim();
    if (cleanedTitle.length === 0) return title.trim(); // Fallback to original
    if (cleanedTitle.length > 150) {
      cleanedTitle = cleanedTitle.substring(0, 147) + '...';
    }
    
    return cleanedTitle;
  }

  function extractPageInfo() {
    // Enhanced title extraction with fallbacks and cleaning
    let title = document.title;
    
    // Try multiple sources for title
    if (!title || title.trim() === '') {
      title = document.querySelector('meta[property="og:title"]')?.content ||
              document.querySelector('meta[name="twitter:title"]')?.content ||
              document.querySelector('h1')?.textContent ||
              'Untitled Page';
    }
    
    // Clean up common title patterns (define cleanTitle inline since it's not available in the injected context)
    function cleanTitle(title) {
      if (!title) return 'Untitled Page';
      
      // Remove common site suffixes and prefixes
      const commonPatterns = [
        / - YouTube$/,
        / \| YouTube$/,
        / - Medium$/,
        / \| Medium$/,
        / - ArXiv$/,
        / \| ArXiv$/,
        / - Wikipedia$/,
        / \| Wikipedia$/,
        / - GitHub$/,
        / \| GitHub$/,
        / - Stack Overflow$/,
        / \| Stack Overflow$/,
        / - Reddit$/,
        / \| Reddit$/,
        /^(\([^)]+\)\s*)?/, // Remove prefixes like "(PDF)" or "(Video)"
      ];
      
      let cleanedTitle = title.trim();
      
      // Apply cleaning patterns
      for (const pattern of commonPatterns) {
        cleanedTitle = cleanedTitle.replace(pattern, '');
      }
      
      // Only apply generic pattern if title is still long enough
      if (cleanedTitle.length > 50) {
        cleanedTitle = cleanedTitle.replace(/\s*[\|\-]\s*[^|\-]*$/, '');
      }
      
      // Clean up extra whitespace and ensure reasonable length
      cleanedTitle = cleanedTitle.trim();
      if (cleanedTitle.length === 0) return title.trim(); // Fallback to original
      if (cleanedTitle.length > 150) {
        cleanedTitle = cleanedTitle.substring(0, 147) + '...';
      }
      
      return cleanedTitle;
    }
    
    title = cleanTitle(title);
    
    const url = window.location.href;
    const description = document.querySelector('meta[name="description"]')?.content || 
                       document.querySelector('meta[property="og:description"]')?.content || '';
    
    // Detect content type based on URL and page content
    let type = 'article';
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('youtube.com') || urlLower.includes('vimeo.com') || 
        urlLower.includes('video') || document.querySelector('video')) {
      type = 'video';
    } else if (urlLower.includes('arxiv.org') || urlLower.includes('pdf') || 
               title.toLowerCase().includes('paper') || 
               document.querySelector('a[href*=".pdf"]')) {
      type = 'research-paper';
    } else if (urlLower.includes('blog') || urlLower.includes('medium.com') || 
               urlLower.includes('dev.to')) {
      type = 'blog-post';
    } else if (urlLower.includes('docs') || urlLower.includes('documentation') || 
               title.toLowerCase().includes('documentation')) {
      type = 'documentation';
    }

    // Extract additional metadata
    const author = document.querySelector('meta[name="author"]')?.content || 
                   document.querySelector('[rel="author"]')?.textContent || '';
    
    const publishDate = document.querySelector('meta[property="article:published_time"]')?.content ||
                        document.querySelector('time[datetime]')?.getAttribute('datetime') || '';

    return {
      title,
      url,
      description,
      type,
      author,
      publishDate,
      domain: new URL(url).hostname
    };
  }

  function displayPageInfo(data) {
    pageTitle.textContent = data.title;
    pageUrl.textContent = data.url;
    
    // Populate the title input field
    document.getElementById('title').value = data.title;
    
    // Set content type with appropriate emoji and color
    const typeMap = {
      'video': { emoji: '🎥', text: 'Video', color: '#ff4757' },
      'research-paper': { emoji: '📄', text: 'Research Paper', color: '#5352ed' },
      'blog-post': { emoji: '📝', text: 'Blog Post', color: '#ff6b35' },
      'documentation': { emoji: '📚', text: 'Documentation', color: '#26de81' },
      'article': { emoji: '📰', text: 'Article', color: '#45aaf2' }
    };
    
    const typeInfo = typeMap[data.type] || typeMap['article'];
    contentType.textContent = `${typeInfo.emoji} ${typeInfo.text}`;
    contentType.style.backgroundColor = typeInfo.color + '20';
    contentType.style.color = typeInfo.color;

    // Pre-select appropriate category
    const categorySelect = document.getElementById('category');
    if (data.type === 'video') categorySelect.value = 'videos';
    else if (data.type === 'research-paper') categorySelect.value = 'research-papers';
    else if (data.type === 'blog-post') categorySelect.value = 'blog-posts';
    else if (data.type === 'documentation') categorySelect.value = 'documentation';
    
    // Store page data for saving
    window.currentPageData = data;
  }

  async function loadUserPreferences() {
    try {
      const settings = await chrome.storage.sync.get(['notionToken', 'databaseId', 'defaultCategory', 'defaultWorkArea']);
      
      if (!settings.notionToken) {
        showStatus('Please configure your Notion integration in settings', 'error');
        saveBtn.disabled = true;
      }
      
      if (settings.defaultCategory) {
        document.getElementById('category').value = settings.defaultCategory;
      }

      if (settings.defaultWorkArea) {
        document.getElementById('workArea').value = settings.defaultWorkArea;
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    
    // Check if this is a duplicate and user hasn't explicitly allowed it or enabled update mode
    if (currentDuplicateInfo && currentDuplicateInfo.duplicate && !allowDuplicateSave && !isUpdateMode) {
      showStatus('This page was already saved. Click "Update Existing" or "Save Anyway" to proceed.', 'error');
      return;
    }
    
    const titleValue = document.getElementById('title').value.trim();
    const categoryValue = document.getElementById('category').value.trim();
    const workAreaValue = document.getElementById('workArea').value.trim();
    
    if (!titleValue) {
      showStatus('Please enter a title', 'error');
      return;
    }

    // Only require category and work area for new saves, not updates
    if (!isUpdateMode) {
      if (!categoryValue) {
        showStatus('Please select a category', 'error');
        return;
      }

      if (!workAreaValue) {
        showStatus('Please select a work area', 'error');
        return;
      }
    }

    // Warn user if trying to update with "Untitled Page"
    if (isUpdateMode && !shouldUpdateTitle(titleValue)) {
      showStatus(`Note: Title "${titleValue}" will not be updated (considered a fallback value)`, 'warning');
    }
    
    const saveData = {
      ...window.currentPageData,
      title: titleValue,
      category: categoryValue,
      workArea: workAreaValue,
      tags: document.getElementById('tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      notes: document.getElementById('notes').value.trim(),
      readingStatus: document.getElementById('readingStatus').value || 'to-read',
      priority: document.getElementById('priority').checked,
      savedAt: new Date().toISOString(),
      isUpdate: isUpdateMode
    };

    console.log('Save data being sent:', saveData);

    saveBtn.disabled = true;
    saveBtn.classList.add('loading');
    
    if (isUpdateMode && currentDuplicateInfo) {
      showStatus('Updating existing entry...', 'loading');
      
      try {
        console.log('Sending update request to background script...');
        console.log('Update data:', saveData);
        console.log('Page ID:', currentDuplicateInfo.notionPageId);
        
        const response = await chrome.runtime.sendMessage({
          action: 'updateToNotion',
          data: saveData,
          pageId: currentDuplicateInfo.notionPageId
        });

        console.log('Background script response:', response);

        if (response && response.success) {
          showStatus('Successfully updated in Notion! 🎉', 'success');
          
          // Reset states
          allowDuplicateSave = false;
          currentDuplicateInfo = null;
          isUpdateMode = false;
          hideDuplicateWarning();

          // Close popup after short delay
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          const errorMsg = response?.error || 'Failed to update in Notion. Please check your settings.';
          console.error('Update failed with error:', errorMsg);
          console.error('Full response:', response);
          showStatus(`❌ ${errorMsg}`, 'error');
        }

      } catch (error) {
        console.error('Update error caught in popup:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        showStatus('Failed to update in Notion. Please check your settings and try again.', 'error');
      }
    } else {
      showStatus('Saving to Notion...', 'loading');
      
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'saveToNotion',
          data: saveData
        });

        if (response && response.success) {
          showStatus('Successfully saved to Notion! 🎉', 'success');
          
          // Reset duplicate state since we've successfully saved
          allowDuplicateSave = false;
          currentDuplicateInfo = null;
          isUpdateMode = false;
          hideDuplicateWarning();

          // Close popup after short delay
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          const errorMsg = response?.error || 'Failed to save to Notion. Please check your settings.';
          showStatus(`❌ ${errorMsg}`, 'error');
        }

      } catch (error) {
        console.error('Save error:', error);
        showStatus('Failed to save to Notion. Please check your settings.', 'error');
      }
    }
    
    saveBtn.disabled = false;
    saveBtn.classList.remove('loading');
  }

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
    }
  }

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  async function handleRefreshTitle() {
    try {
      // Add loading state to button
      refreshTitleBtn.style.opacity = '0.6';
      refreshTitleBtn.style.pointerEvents = 'none';
      
      // Re-extract page information
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageInfo
      });
      
      const pageData = results[0].result;
      
      // Update only the title field
      document.getElementById('title').value = pageData.title;
      
      // Re-check for duplicates with the new page data
      await checkForDuplicates(pageData.url);
      
      // Show brief success feedback
      const originalTitle = refreshTitleBtn.title;
      refreshTitleBtn.title = 'Title refreshed!';
      
      setTimeout(() => {
        refreshTitleBtn.title = originalTitle;
      }, 2000);
      
    } catch (error) {
      console.error('Error refreshing title:', error);
      showStatus('Failed to refresh title', 'error');
    } finally {
      // Remove loading state
      refreshTitleBtn.style.opacity = '1';
      refreshTitleBtn.style.pointerEvents = 'auto';
    }
  }

  async function checkForDuplicates(url) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkDuplicate',
        url: url
      });

      if (response && response.duplicate) {
        currentDuplicateInfo = response;
        allowDuplicateSave = false;
        displayDuplicateWarning(response);
      } else {
        allowDuplicateSave = true;
        hideDuplicateWarning();
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      allowDuplicateSave = true;
      hideDuplicateWarning();
    }
  }

  function displayDuplicateWarning(duplicateInfo) {
    duplicateWarning.style.display = 'block';
    
    // Format the date
    const savedDate = new Date(duplicateInfo.savedAt);
    duplicateDate.textContent = savedDate.toLocaleDateString() + ' at ' + savedDate.toLocaleTimeString();
    
    // Show current values if available
    if (duplicateInfo.currentValues) {
      currentValues.style.display = 'block';
      currentStatus.textContent = getStatusDisplayName(duplicateInfo.currentValues.status);
      currentCategory.textContent = getCategoryDisplayName(duplicateInfo.currentValues.category);
      currentWorkArea.textContent = getWorkAreaDisplayName(duplicateInfo.currentValues.workArea);
      
      // Pre-populate form with current values for easier updating
      populateFormWithCurrentValues(duplicateInfo.currentValues);
    }
    
    // Update save button state
    saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17,21 17,13 7,13 7,21"></polyline>
      <polyline points="7,3 7,8 15,8"></polyline>
    </svg>
    ⚠️ Already Saved`;
    saveBtn.disabled = true;
    saveBtn.style.background = '#6c757d';
  }

  function populateFormWithCurrentValues(currentValues) {
    // Only populate if the form is empty or user hasn't made changes
    if (currentValues.category && !document.getElementById('category').value) {
      document.getElementById('category').value = currentValues.category;
    }
    if (currentValues.status && !document.getElementById('readingStatus').value) {
      document.getElementById('readingStatus').value = currentValues.status;
    }
    if (currentValues.workArea && !document.getElementById('workArea').value) {
      document.getElementById('workArea').value = currentValues.workArea;
    }
    if (currentValues.priority !== undefined) {
      document.getElementById('priority').checked = currentValues.priority;
    }
    if (currentValues.tags && currentValues.tags.length > 0 && !document.getElementById('tags').value) {
      document.getElementById('tags').value = currentValues.tags.join(', ');
    }
  }

  // Helper functions to convert internal values to display names
  function getStatusDisplayName(status) {
    const statusMap = {
      'to-read': 'To Read',
      'reading': 'Reading',
      'completed': 'Completed',
      'reference': 'Reference'
    };
    return statusMap[status] || status;
  }

  function getCategoryDisplayName(category) {
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
    return categoryMap[category] || category;
  }

  function getWorkAreaDisplayName(workArea) {
    const workAreaMap = {
      'work': 'Work',
      'lab': 'Lab',
      'side-project': 'Side Project',
      'personal-interest': 'Personal Interest'
    };
    return workAreaMap[workArea] || workArea;
  }

  function hideDuplicateWarning() {
    duplicateWarning.style.display = 'none';
    currentValues.style.display = 'none';
    
    // Reset save button
    const originalContent = saveBtn.innerHTML;
    if (saveBtn.textContent.includes('Already Saved') || saveBtn.textContent.includes('Update in Notion')) {
      saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17,21 17,13 7,13 7,21"></polyline>
        <polyline points="7,3 7,8 15,8"></polyline>
      </svg>
      Save to Notion`;
      saveBtn.disabled = false;
      saveBtn.style.background = '';
    }
    
    // Reset form labels if we were in update mode
    if (isUpdateMode) {
      resetFormLabelsForCreateMode();
    }
    
    // Reset states
    isUpdateMode = false;
  }

  function handleViewExisting() {
    if (currentDuplicateInfo && currentDuplicateInfo.notionUrl) {
      // Open the existing Notion page
      chrome.tabs.create({ url: currentDuplicateInfo.notionUrl });
    } else if (currentDuplicateInfo && currentDuplicateInfo.notionPageId) {
      // Construct Notion URL from page ID
      const notionUrl = `https://notion.so/${currentDuplicateInfo.notionPageId.replace(/-/g, '')}`;
      chrome.tabs.create({ url: notionUrl });
    } else {
      showStatus('Cannot find the existing page URL', 'error');
    }
  }

  function handleUpdateExisting() {
    isUpdateMode = true;
    allowDuplicateSave = false;
    
    // Update form labels to indicate optional fields
    updateFormLabelsForUpdateMode();
    
    // Update save button to reflect update mode
    saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M3 21v-5h5"></path>
    </svg>
    Update in Notion`;
    saveBtn.disabled = false;
    saveBtn.style.background = '#28a745';
    
    // Hide the duplicate warning since user has chosen to update
    duplicateWarning.style.display = 'none';
    
    // Check if current title is "Untitled Page" and show helpful message
    const currentTitle = document.getElementById('title').value.trim();
    if (!shouldUpdateTitle(currentTitle)) {
      showStatus(`Update mode enabled. Note: Edit the title to update it (current "${currentTitle}" will be skipped).`, 'success');
    } else {
      showStatus('Update mode enabled. Modify any fields and click "Update in Notion". Empty fields will keep their current values.', 'success');
    }
  }

  function updateFormLabelsForUpdateMode() {
    // Update category label and show "keep current" option
    const categoryLabel = document.querySelector('label[for="category"]');
    if (categoryLabel) {
      categoryLabel.innerHTML = 'Category <small style="color: #666; font-weight: normal;">(optional - leave empty to keep current)</small>';
    }
    const categorySelect = document.getElementById('category');
    const categoryKeepOption = categorySelect.querySelector('option[value="keep-current"]');
    if (categoryKeepOption) {
      categoryKeepOption.style.display = 'block';
      categoryKeepOption.textContent = '🔄 Keep current value';
    }
    // Update first option text for update mode
    const categoryFirstOption = categorySelect.querySelector('option[value=""]');
    if (categoryFirstOption) {
      categoryFirstOption.textContent = 'Keep current value';
    }
    // Remove required attribute in update mode
    categorySelect.removeAttribute('required');
    
    // Update work area label and show "keep current" option
    const workAreaLabel = document.querySelector('label[for="workArea"]');
    if (workAreaLabel) {
      workAreaLabel.innerHTML = 'Work Area <small style="color: #666; font-weight: normal;">(optional - leave empty to keep current)</small>';
    }
    const workAreaSelect = document.getElementById('workArea');
    const workAreaKeepOption = workAreaSelect.querySelector('option[value="keep-current"]');
    if (workAreaKeepOption) {
      workAreaKeepOption.style.display = 'block';
      workAreaKeepOption.textContent = '🔄 Keep current value';
    }
    // Update first option text for update mode
    const workAreaFirstOption = workAreaSelect.querySelector('option[value=""]');
    if (workAreaFirstOption) {
      workAreaFirstOption.textContent = 'Keep current value';
    }
    // Remove required attribute in update mode
    workAreaSelect.removeAttribute('required');
    
    // Update reading status label
    const statusLabel = document.querySelector('label[for="readingStatus"]');
    if (statusLabel) {
      statusLabel.innerHTML = 'Reading Status <small style="color: #666; font-weight: normal;">(leave as-is to keep current)</small>';
    }
  }

  function resetFormLabelsForCreateMode() {
    // Reset category label and hide "keep current" option
    const categoryLabel = document.querySelector('label[for="category"]');
    if (categoryLabel) {
      categoryLabel.textContent = 'Category';
    }
    const categorySelect = document.getElementById('category');
    const categoryKeepOption = categorySelect.querySelector('option[value="keep-current"]');
    if (categoryKeepOption) {
      categoryKeepOption.style.display = 'none';
    }
    // Reset first option text
    const categoryFirstOption = categorySelect.querySelector('option[value=""]');
    if (categoryFirstOption) {
      categoryFirstOption.textContent = 'Select a category...';
    }
    // Add required attribute back
    categorySelect.setAttribute('required', '');
    
    // Reset work area label and hide "keep current" option
    const workAreaLabel = document.querySelector('label[for="workArea"]');
    if (workAreaLabel) {
      workAreaLabel.textContent = 'Work Area';
    }
    const workAreaSelect = document.getElementById('workArea');
    const workAreaKeepOption = workAreaSelect.querySelector('option[value="keep-current"]');
    if (workAreaKeepOption) {
      workAreaKeepOption.style.display = 'none';
    }
    // Reset first option text
    const workAreaFirstOption = workAreaSelect.querySelector('option[value=""]');
    if (workAreaFirstOption) {
      workAreaFirstOption.textContent = 'Select work area...';
    }
    // Add required attribute back
    workAreaSelect.setAttribute('required', '');
    
    // Reset reading status label
    const statusLabel = document.querySelector('label[for="readingStatus"]');
    if (statusLabel) {
      statusLabel.textContent = 'Reading Status';
    }
  }

  function handleSaveAnyway() {
    allowDuplicateSave = true;
    isUpdateMode = false;
    hideDuplicateWarning();
    showStatus('You can now save this page again', 'success');
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
});

// Handle keyboard shortcuts
chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'save-to-notion') {
    document.getElementById('saveBtn').click();
  }
}); 