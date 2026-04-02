// Content script for Paper Saver - page info extraction + source enrichment
(function() {
  'use strict';

  // ============================================================
  // CORE PAGE INFO EXTRACTION
  // ============================================================

  window.extractPageInfo = function() {
    const url = window.location.href;
    const domain = window.location.hostname;

    const title = extractTitle();
    const description = getDescription();
    const type = detectContentType(url, domain, title);
    const author = getAuthor();
    const publishDate = getPublishDate();
    const readingTime = estimateReadingTime();
    const keywords = getKeywords();
    const language = document.documentElement.lang || 'en';

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

  // ============================================================
  // ENRICHED PAGE INFO - source-specific enrichment + tag suggestions
  // ============================================================

  window.getEnrichedPageInfo = function() {
    const url = window.location.href;
    const domain = window.location.hostname;
    const type = detectContentType(url, domain, document.title);

    let enriched = {
      suggestedTags: suggestTags(domain, type),
      author: '',
      description: ''
    };

    // ArXiv enrichment
    if (domain.includes('arxiv.org')) {
      const arxivData = enrichArXiv();
      if (arxivData) {
        enriched = { ...enriched, ...arxivData };
      }
    }

    // GitHub enrichment
    else if (domain === 'github.com' || domain.endsWith('.github.com')) {
      const ghData = enrichGitHub();
      if (ghData) {
        enriched = { ...enriched, ...ghData };
      }
    }

    // HuggingFace enrichment
    else if (domain.includes('huggingface.co')) {
      const hfData = enrichHuggingFace();
      if (hfData) {
        enriched = { ...enriched, ...hfData };
      }
    }

    // YouTube enrichment
    else if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      const ytData = enrichYouTube();
      if (ytData) {
        enriched = { ...enriched, ...ytData };
      }
    }

    return enriched;
  };

  // ============================================================
  // SOURCE-SPECIFIC ENRICHMENT
  // ============================================================

  function enrichArXiv() {
    try {
      // ArXiv page selectors
      const titleEl = document.querySelector('h1.title.mathjax') ||
                      document.querySelector('h1.title') ||
                      document.querySelector('#abs h1');
      const authorsEl = document.querySelector('.authors') ||
                        document.querySelector('#authors');
      const abstractEl = document.querySelector('blockquote.abstract.mathjax') ||
                         document.querySelector('blockquote.abstract') ||
                         document.querySelector('#abs blockquote');
      const subjectEl = document.querySelector('.primary-subject') ||
                        document.querySelector('.subjects');

      const rawTitle = titleEl?.textContent?.replace(/^Title:\s*/i, '').trim() || '';
      const rawAbstract = abstractEl?.textContent?.replace(/^Abstract:\s*/i, '').trim() || '';
      const rawAuthors = authorsEl?.textContent?.replace(/^Authors?:\s*/i, '').trim() || '';

      // Build author string (first 3 authors + "et al." if more)
      const authorList = rawAuthors.split(',').map(a => a.trim()).filter(Boolean);
      const authorStr = authorList.length > 3
        ? authorList.slice(0, 3).join(', ') + ' et al.'
        : authorList.join(', ');

      const tags = ['paper', 'research'];
      if (subjectEl) {
        const subjectText = subjectEl.textContent.toLowerCase();
        if (subjectText.includes('machine learning') || subjectText.includes('cs.lg')) tags.push('machine-learning');
        if (subjectText.includes('computer vision') || subjectText.includes('cs.cv')) tags.push('computer-vision');
        if (subjectText.includes('nlp') || subjectText.includes('computation and language')) tags.push('nlp');
        if (subjectText.includes('cs.ai')) tags.push('ai');
      }

      return {
        title: rawTitle || null,
        author: authorStr,
        description: rawAbstract.substring(0, 500),
        suggestedTags: [...new Set(tags)]
      };
    } catch (e) {
      return null;
    }
  }

  function enrichGitHub() {
    try {
      // Only enrich repo root pages, not issues/PRs/files
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts.length !== 2) return null; // Must be /owner/repo

      const descEl = document.querySelector('[data-testid="repo-description"]') ||
                     document.querySelector('.f4.my-3') ||
                     document.querySelector('.repository-description p');

      const starsEl = document.querySelector('#repo-stars-counter') ||
                      document.querySelector('[data-testid="stargazers-count"]') ||
                      document.querySelector('.Counter[id*="star"]');

      const langEl = document.querySelector('[data-testid="repo-language"]') ||
                     document.querySelector('.color-fg-default.text-bold.mr-1') ||
                     document.querySelector('.repository-lang-stats-container .d-inline');

      const topicEls = document.querySelectorAll('.topic-tag, [data-testid="topic-tag"]');

      const description = descEl?.textContent?.trim() || '';
      const language = langEl?.textContent?.trim() || '';
      const topics = Array.from(topicEls).map(el => el.textContent.trim()).filter(Boolean).slice(0, 5);
      const stars = starsEl?.textContent?.trim() || '';

      const tags = ['github', 'open-source'];
      if (language) tags.push(language.toLowerCase().replace(/\s+/g, '-'));
      topics.forEach(t => tags.push(t.toLowerCase().replace(/\s+/g, '-')));

      const starsInfo = stars ? ` (⭐ ${stars})` : '';

      return {
        description: description + starsInfo,
        suggestedTags: [...new Set(tags)].slice(0, 8)
      };
    } catch (e) {
      return null;
    }
  }

  function enrichHuggingFace() {
    try {
      const titleEl = document.querySelector('h1') ||
                      document.querySelector('.paper-title');
      const abstractEl = document.querySelector('.paper-abstract p') ||
                         document.querySelector('[class*="abstract"]');
      const authorsEl = document.querySelector('.paper-authors') ||
                        document.querySelector('[class*="authors"]');

      const title = titleEl?.textContent?.trim() || '';
      const abstract = abstractEl?.textContent?.trim() || '';
      const authors = authorsEl?.textContent?.trim() || '';

      const tags = ['huggingface', 'ml', 'ai'];
      if (window.location.pathname.includes('/papers/')) tags.push('paper', 'research');
      if (window.location.pathname.includes('/models/')) tags.push('model');
      if (window.location.pathname.includes('/datasets/')) tags.push('dataset');

      return {
        title: title || null,
        author: authors.replace(/^by\s*/i, '').trim(),
        description: abstract.substring(0, 500),
        suggestedTags: tags
      };
    } catch (e) {
      return null;
    }
  }

  function enrichYouTube() {
    try {
      const channelEl = document.querySelector('ytd-channel-name yt-formatted-string') ||
                        document.querySelector('#channel-name .ytd-channel-name') ||
                        document.querySelector('.ytd-video-owner-renderer #text');

      const channel = channelEl?.textContent?.trim() || '';

      // Duration from meta
      const durationMeta = document.querySelector('meta[itemprop="duration"]');
      let durationStr = '';
      if (durationMeta) {
        // PT1H2M3S format
        const match = durationMeta.content.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
          const h = parseInt(match[1] || 0);
          const m = parseInt(match[2] || 0);
          const s = parseInt(match[3] || 0);
          durationStr = h > 0
            ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `${m}:${String(s).padStart(2,'0')}`;
        }
      }

      const tags = ['video', 'youtube'];
      if (channel) tags.push(channel.toLowerCase().replace(/\s+/g, '-').substring(0, 30));

      return {
        author: channel,
        description: durationStr ? `Duration: ${durationStr}` : '',
        suggestedTags: tags
      };
    } catch (e) {
      return null;
    }
  }

  // ============================================================
  // AUTO-TAG SUGGESTIONS
  // ============================================================

  function suggestTags(domain, type) {
    const domainMap = {
      'arxiv.org': ['paper', 'research'],
      'openreview.net': ['paper', 'research'],
      'semanticscholar.org': ['paper', 'research'],
      'researchgate.net': ['research'],
      'github.com': ['github', 'code'],
      'gitlab.com': ['gitlab', 'code'],
      'youtube.com': ['video'],
      'youtu.be': ['video'],
      'huggingface.co': ['ml', 'ai', 'huggingface'],
      'medium.com': ['blog'],
      'dev.to': ['blog', 'dev'],
      'substack.com': ['blog', 'newsletter'],
      'hashnode.com': ['blog'],
      'towardsdatascience.com': ['data-science', 'ml', 'blog'],
      'paperswithcode.com': ['paper', 'ml', 'code'],
      'distill.pub': ['paper', 'ml'],
      'lesswrong.com': ['ai', 'blog'],
      'readthedocs.io': ['docs'],
      'gitbook.io': ['docs'],
      'stackoverflow.com': ['stackoverflow', 'q-a'],
      'reddit.com': ['reddit'],
      'twitter.com': ['twitter'],
      'x.com': ['twitter'],
      'linkedin.com': ['linkedin']
    };

    for (const [d, tags] of Object.entries(domainMap)) {
      if (domain.includes(d)) return tags;
    }

    // Fallback by type
    const typeMap = {
      'video': ['video'],
      'research-paper': ['paper', 'research'],
      'blog-post': ['blog'],
      'documentation': ['docs'],
      'tutorial': ['tutorial']
    };

    return typeMap[type] || [];
  }

  // ============================================================
  // CORE EXTRACTION HELPERS
  // ============================================================

  function extractTitle() {
    let title = document.title;

    if (!title || title.trim() === '') {
      title = document.querySelector('meta[property="og:title"]')?.content ||
              document.querySelector('meta[name="twitter:title"]')?.content ||
              document.querySelector('h1')?.textContent ||
              'Untitled Page';
    }

    return cleanTitle(title);
  }

  function cleanTitle(title) {
    if (!title) return 'Untitled Page';
    const patterns = [
      / - YouTube$/i, / \| YouTube$/i,
      / - Medium$/i, / \| Medium$/i,
      / - arXiv$/i, / \| arXiv$/i,
      / - Wikipedia$/i, / \| Wikipedia$/i,
      / - GitHub$/i, / \| GitHub$/i,
      / - Stack Overflow$/i, / \| Stack Overflow$/i,
      / - Reddit$/i, / \| Reddit$/i,
      / - Google Scholar$/i,
      /^(\([^)]+\)\s*)/ // Remove "(PDF)" prefix etc.
    ];
    let cleaned = title.trim();
    for (const p of patterns) cleaned = cleaned.replace(p, '');
    if (cleaned.length > 50) cleaned = cleaned.replace(/\s*[\|\-]\s*[^|\-]*$/, '');
    cleaned = cleaned.trim();
    if (cleaned.length === 0) return title.trim();
    if (cleaned.length > 150) cleaned = cleaned.substring(0, 147) + '...';
    return cleaned;
  }

  function getDescription() {
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      'meta[property="description"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.content?.trim()) return el.content.trim();
    }
    const p = document.querySelector('article p, .post-content p, .entry-content p, p');
    if (p) return p.textContent.trim().substring(0, 300);
    return '';
  }

  function detectContentType(url, domain, title) {
    const urlL = url.toLowerCase();
    const titleL = (title || '').toLowerCase();
    const domainL = domain.toLowerCase();

    if (domainL.includes('youtube.com') || domainL.includes('youtu.be') ||
        domainL.includes('vimeo.com') || domainL.includes('twitch.tv') ||
        urlL.includes('video') || document.querySelector('video')) {
      return 'video';
    }

    if (domainL.includes('arxiv.org') || domainL.includes('openreview.net') ||
        domainL.includes('scholar.google') || domainL.includes('researchgate.net') ||
        domainL.includes('acm.org') || domainL.includes('ieee.org') ||
        domainL.includes('semanticscholar.org') || domainL.includes('paperswithcode.com') ||
        urlL.includes('.pdf') || document.querySelector('.abstract')) {
      return 'research-paper';
    }

    if (domainL.includes('medium.com') || domainL.includes('dev.to') ||
        domainL.includes('hashnode.com') || domainL.includes('substack.com') ||
        domainL.includes('towardsdatascience.com') ||
        urlL.includes('/blog') || urlL.includes('/post/') ||
        document.querySelector('article[class*="post"]')) {
      return 'blog-post';
    }

    if (urlL.includes('docs') || urlL.includes('documentation') ||
        titleL.includes('documentation') || titleL.includes(' docs ') ||
        domainL.includes('readthedocs.io') || domainL.includes('gitbook.io') ||
        document.querySelector('.documentation')) {
      return 'documentation';
    }

    if (titleL.includes('tutorial') || titleL.includes('guide') ||
        titleL.includes('how to') || titleL.includes('walkthrough') ||
        urlL.includes('tutorial') || urlL.includes('/guide')) {
      return 'tutorial';
    }

    return 'article';
  }

  function getAuthor() {
    const selectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
      '[rel="author"]',
      '.author-name',
      '.byline',
      '[class*="author"]',
      '[data-author]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const content = el.content || el.textContent || el.getAttribute('data-author');
        if (content && content.trim().length > 0 && content.trim().length < 200) {
          return content.trim();
        }
      }
    }
    return '';
  }

  function getPublishDate() {
    const selectors = [
      'meta[property="article:published_time"]',
      'meta[name="publish_date"]',
      'meta[name="date"]',
      'time[datetime]',
      '.publish-date',
      '[class*="publish"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const date = el.content || el.getAttribute('datetime') || el.textContent;
        if (date) {
          const parsed = new Date(date);
          if (!isNaN(parsed.getTime())) return parsed.toISOString();
        }
      }
    }
    return '';
  }

  function estimateReadingTime() {
    const text = document.body.textContent || document.body.innerText || '';
    const wordCount = text.trim().split(/\s+/).length;
    return { minutes: Math.ceil(wordCount / 200), words: wordCount };
  }

  function getKeywords() {
    const meta = document.querySelector('meta[name="keywords"]');
    if (meta?.content) {
      return meta.content.split(',').map(k => k.trim()).filter(Boolean).slice(0, 10);
    }
    const tagEls = document.querySelectorAll('.tag, [class*="tag-"], [class*="-tag"]');
    if (tagEls.length > 0) {
      return Array.from(tagEls)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 10);
    }
    return [];
  }

  // ============================================================
  // KEYBOARD SHORTCUT LISTENER
  // ============================================================

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openPopup' });
    }
  });

})();
