// Content script for enhanced page information extraction
(function() {
  'use strict';

  // Enhanced page information extraction
  window.extractPageInfo = function() {
    const title = document.title;
    const url = window.location.href;
    
    // Extract description from multiple sources
    const description = getDescription();
    
    // Detect content type with enhanced detection
    const type = detectContentType();
    
    // Extract author information
    const author = getAuthor();
    
    // Extract publication date
    const publishDate = getPublishDate();
    
    // Extract reading time estimate
    const readingTime = estimateReadingTime();
    
    // Extract keywords/tags
    const keywords = getKeywords();
    
    // Get page language
    const language = document.documentElement.lang || 'en';
    
    // Get domain information
    const domain = new URL(url).hostname;
    
    return {
      title,
      url,
      description,
      type,
      author,
      publishDate,
      readingTime,
      keywords,
      language,
      domain,
      extractedAt: new Date().toISOString()
    };
  };

  function getDescription() {
    // Try multiple meta tags
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[property="description"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.content) {
        return element.content.trim();
      }
    }
    
    // Fallback to first paragraph
    const firstParagraph = document.querySelector('p');
    if (firstParagraph) {
      return firstParagraph.textContent.trim().substring(0, 300);
    }
    
    return '';
  }

  function detectContentType() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const domain = window.location.hostname.toLowerCase();
    
    // Video detection
    if (domain.includes('youtube.com') || domain.includes('youtu.be') ||
        domain.includes('vimeo.com') || domain.includes('twitch.tv') ||
        url.includes('video') || document.querySelector('video') ||
        title.includes('video')) {
      return 'video';
    }
    
    // Research paper detection
    if (domain.includes('arxiv.org') || domain.includes('scholar.google') ||
        domain.includes('researchgate.net') || domain.includes('acm.org') ||
        domain.includes('ieee.org') || url.includes('.pdf') ||
        title.includes('paper') || title.includes('research') ||
        document.querySelector('a[href*=".pdf"]') ||
        document.querySelector('.abstract')) {
      return 'research-paper';
    }
    
    // Blog post detection
    if (domain.includes('medium.com') || domain.includes('dev.to') ||
        domain.includes('hashnode.com') || domain.includes('substack.com') ||
        url.includes('blog') || url.includes('/post/') ||
        document.querySelector('article[class*="post"]') ||
        document.querySelector('.blog-post')) {
      return 'blog-post';
    }
    
    // Documentation detection
    if (url.includes('docs') || url.includes('documentation') ||
        title.includes('documentation') || title.includes('docs') ||
        domain.includes('readthedocs.io') || domain.includes('gitbook.io') ||
        document.querySelector('.documentation') ||
        document.querySelector('nav[class*="sidebar"]')) {
      return 'documentation';
    }
    
    // Tutorial detection
    if (title.includes('tutorial') || title.includes('guide') ||
        title.includes('how to') || title.includes('walkthrough') ||
        url.includes('tutorial') || url.includes('guide')) {
      return 'tutorial';
    }
    
    // News article detection
    if (domain.includes('news') || domain.includes('techcrunch.com') ||
        domain.includes('reuters.com') || domain.includes('bbc.com') ||
        document.querySelector('time[class*="publish"]') ||
        document.querySelector('.article-date')) {
      return 'news';
    }
    
    return 'article';
  }

  function getAuthor() {
    // Try multiple author selectors
    const selectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
      '[rel="author"]',
      '.author',
      '.byline',
      '[class*="author"]',
      '[data-author]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.content || element.textContent || element.getAttribute('data-author');
        if (content) {
          return content.trim();
        }
      }
    }
    
    return '';
  }

  function getPublishDate() {
    // Try multiple date selectors
    const selectors = [
      'meta[property="article:published_time"]',
      'meta[name="publish_date"]',
      'meta[name="date"]',
      'time[datetime]',
      '.publish-date',
      '.date',
      '[class*="publish"]',
      '[class*="date"]'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const date = element.content || element.getAttribute('datetime') || element.textContent;
        if (date) {
          // Try to parse and validate the date
          const parsedDate = new Date(date);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
      }
    }
    
    return '';
  }

  function estimateReadingTime() {
    const text = document.body.textContent || document.body.innerText || '';
    const wordsPerMinute = 200;
    const wordCount = text.trim().split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / wordsPerMinute);
    
    return {
      minutes: readingTime,
      words: wordCount
    };
  }

  function getKeywords() {
    // Extract keywords from meta tags
    const keywordsMeta = document.querySelector('meta[name="keywords"]');
    if (keywordsMeta && keywordsMeta.content) {
      return keywordsMeta.content.split(',').map(k => k.trim()).filter(Boolean);
    }
    
    // Extract from tags/categories if available
    const tagElements = document.querySelectorAll('.tag, .category, [class*="tag"], [class*="label"]');
    if (tagElements.length > 0) {
      return Array.from(tagElements)
        .map(el => el.textContent.trim())
        .filter(text => text.length > 0 && text.length < 30)
        .slice(0, 10);
    }
    
    return [];
  }

  // Listen for keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      // This will be handled by the background script
      chrome.runtime.sendMessage({ action: 'openPopup' });
    }
  });

  // Visual indicator removed - extension can still be accessed via browser toolbar icon and Ctrl+Shift+S
})(); 