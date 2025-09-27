// === Investors page lock (Estates) ===
(() => {
  const MODE = "Estates";
  const LOCK_KEY = "__INVESTORS_ACTIVE_MODE__";
  const active = globalThis[LOCK_KEY];
  if (active && active !== MODE) {
    console.debug(`[Investors][${MODE}] Another mode active: ${active}. Skipping.`);
    return;
  }
  globalThis[LOCK_KEY] = MODE;
  addEventListener("beforeunload", () => {
    if (globalThis[LOCK_KEY] === MODE) delete globalThis[LOCK_KEY];
  });
})();

// Content script for NC Estates Auto-Processor V3.0 - Enhanced with All Fixes
console.log('Estates Auto-Processor V3.0 Enhanced - Loaded with All Fixes');

// Namespaced message constants
const MSG_SCAN = "estate:scan";
const MSG_RESULT = "estate:result";

// Null-safe DOM helpers (use as you edit; no global rewrites)
const $ = (sel, root=document) => root.querySelector(sel);
const $ = (sel, root=document) => Array.from(root.querySelectorAll(sel) || []);
const text = (el) => (el && ('textContent' in el)) ? el.textContent.trim() : '';
const href = (el) => (el && el.getAttribute) ? el.getAttribute('href') : '';

// ========== CONFIGURATION ==========
const MIN_ESTATE_AGE_YEARS = 2;
const DEBUG_MODE = true;

// Human behavior delay settings (in milliseconds)
const DELAYS = {
  MIN_READING: 2000,      // Minimum time to "read" a page
  MAX_READING: 8000,      // Maximum time to "read" a page
  MIN_THINKING: 1500,     // Minimum "thinking" time
  MAX_THINKING: 5000,     // Maximum "thinking" time
  MIN_BEFORE_CLICK: 300,  // Minimum delay before clicking
  MAX_BEFORE_CLICK: 1200, // Maximum delay before clicking
  MIN_BETWEEN_CASES: 5000,// Minimum delay between processing cases
  MAX_BETWEEN_CASES: 15000,// Maximum delay between processing cases
  SCROLL_MIN: 800,        // Minimum time between scroll movements
  SCROLL_MAX: 1500,       // Maximum time between scroll movements
  AVERAGE_WPM: 230        // Average words per minute reading speed
};

// ========== STATE MANAGEMENT ==========
let qualifiedCases = [];
let currentProcessingIndex = 0;
let isProcessing = false;
let nativeConnected = false;

// ========== LOGGING ==========
function log(level, message, data = null) {
  if (!DEBUG_MODE && level === 'DEBUG') return;
  
  const timestamp = new Date().toISOString();
  const logMsg = `[Estates] [${level}] ${message}`;
  
  console.log(logMsg, data || '');
  
  // Update UI log if present
  const logElement = document.getElementById('estate-log');
  if (logElement) {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level.toLowerCase()}`;
    entry.textContent = `[${timestamp.split('T')[1].split('.')[0]}] ${message}`;
    logElement.appendChild(entry);
    logElement.scrollTop = logElement.scrollHeight;
  }
}

// ========== PAGE DETECTION ==========
function detectPageType() {
  const url = window.location.href;
  const bodyText = document.body.innerText.toLowerCase();
  
  // Check for specific HTML elements common in NC ePortal detail pages
  const caseDetailsTable = document.querySelector('table.docket-info, table.case-details, table[id*="case"], table[id*="docket"], table[class*="case"], table[class*="docket"]');
  const partySection = document.querySelector('div[id*="party"], div[class*="party"], section[id*="party"], section[class*="party"]');
  
  // More comprehensive detection for detail pages
  if (url.includes('CaseDetail') || 
      url.includes('caseDetail') ||
      url.includes('case_detail') ||
      url.includes('ViewCase') ||
      url.includes('Docket') ||
      bodyText.includes('case number') ||
      bodyText.includes('case no.') ||
      bodyText.includes('docket number') ||
      bodyText.includes('filing date') ||
      bodyText.includes('case summary') ||
      bodyText.includes('case status') ||
      bodyText.includes('party information') ||
      bodyText.includes('case information') ||
      bodyText.includes('plaintiff') ||
      bodyText.includes('defendant') ||
      bodyText.includes('disposition') ||
      bodyText.includes('case events') ||
      bodyText.includes('event history') ||
      bodyText.includes('document list') ||
      bodyText.includes('register of actions') ||
      bodyText.includes('attorney for') ||
      bodyText.includes('judge assigned') ||
      caseDetailsTable ||
      partySection) {
    log('DEBUG', 'Detected DETAIL page');
    return 'detail';
  }
  
  // Check for search results page
  if (url.includes('SmartSearch') || 
      url.includes('SearchResults') ||
      url.includes('search') ||
      document.querySelector('.ui-tabs-active')?.textContent?.includes('Search Results') ||
      bodyText.includes('search results') ||
      bodyText.includes('the search returned') ||
      (bodyText.includes('displaying') && bodyText.includes('records'))) {
    log('DEBUG', 'Detected RESULTS page');
    return 'results';
  }
  
  // Fallback: Check for single estate case number
  if (bodyText.match(/\d{2}e\d{6}-\d{3}/)) {
    const caseMatches = bodyText.match(/\d{2}e\d{6}-\d{3}/gi);
    if (caseMatches && caseMatches.length === 1) {
      log('DEBUG', 'Detected DETAIL page (single case number)');
      return 'detail';
    } else if (caseMatches && caseMatches.length > 1) {
      log('DEBUG', 'Detected RESULTS page (multiple cases)');
      return 'results';
    }
  }
  
  // Debug log for unknown pages
  const first300Chars = document.body.innerText.substring(0, 300).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  log('DEBUG', 'Page type unknown - First 300 chars of body: ' + first300Chars);
  log('DEBUG', 'Page type unknown - URL: ' + url.substring(0, 100));
  log('DEBUG', 'Page type unknown - Has case number: ' + !!bodyText.match(/\d{2}e\d{6}-\d{3}/));
  
  // Log element classes to help identify page structure
  const elementClasses = Array.from(document.querySelectorAll('*'))
    .map(el => el.className)
    .filter(c => c && c.length < 50)
    .slice(0, 20)
    .join(', ');
  log('DEBUG', 'Page type unknown - Element classes: ' + elementClasses);
  
  return null;
}

// ========== RESULTS PAGE SCANNING ==========
function scanForQualifiedCases() {
  log('INFO', 'Scanning for qualified estate cases...');
  qualifiedCases = [];
  
  const currentYear = new Date().getFullYear();
  let totalEstates = 0;
  let skippedPending = 0;
  let skippedRecent = 0;
  
  // Get all text from the page
  const pageText = document.body.innerText;
  
  // Split by lines to process each potential case
  const lines = pageText.split('\n');
  
  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for estate case pattern (e.g., "22E001713-100")
    if (line.match(/\d{2}E\d{6}-\d{3}/)) {
      // Get the full context - current line plus next few lines
      const context = lines.slice(i, i + 5).join(' ');
      
      // Extract case number
      const caseMatch = context.match(/(\d{2}E\d{6}-\d{3})/);
      if (!caseMatch) continue;
      
      const caseNumber = caseMatch[1];
      
      // Check if it mentions estate
      if (!context.toUpperCase().includes('ESTATE')) continue;
      
      totalEstates++;
      log('DEBUG', `Found estate case: ${caseNumber}`);
      
      // Check for "Pending" status (skip these)
      if (context.includes('Pending')) {
        log('DEBUG', `Skipping pending case: ${caseNumber}`);
        skippedPending++;
        continue;
      }
      
      // Check for "Disposed - Clerk of Superior Court"
      if (!context.includes('Disposed') || !context.includes('Clerk of Superior Court')) {
        log('DEBUG', `Skipping non-disposed case: ${caseNumber}`);
        skippedPending++;
        continue;
      }
      
      // Check age (extract year from case number)
      const yearMatch = caseNumber.match(/^(\d{2})E/);
      if (yearMatch) {
        const caseYear = 2000 + parseInt(yearMatch[1]);
        const caseAge = currentYear - caseYear;
        
        if (caseAge < MIN_ESTATE_AGE_YEARS) {
          log('DEBUG', `Skipping recent case ${caseNumber} (${caseAge} years old)`);
          skippedRecent++;
          continue;
        }
      }
      
      // Extract name (look for pattern after "ESTATE OF")
      let decedentName = 'Unknown';
      const nameMatch = context.match(/(?:ESTATE OF|IN THE MATTER OF)\s+(?:THE ESTATE OF\s+)?([A-Z][A-Z\s]+)/i);
      if (nameMatch) {
        decedentName = nameMatch[1].trim().split(/\s{2,}/)[0];
      }
      
      // Find the link for this case number
      let caseLink = null;
      const allLinks = document.querySelectorAll('a');
      for (let link of allLinks) {
        if (link.textContent && link.textContent.includes(caseNumber)) {
          caseLink = link;
          break;
        }
      }
      
      qualifiedCases.push({
        caseNumber,
        decedentName,
        link: caseLink ? caseLink.href : '#',
        element: caseLink
      });
      
      log('INFO', `Qualified: ${caseNumber} - ${decedentName}`);
    }
  }
  
  log('INFO', `Scan complete: ${qualifiedCases.length} qualified out of ${totalEstates} total estates`);
  log('INFO', `Skipped: ${skippedPending} pending, ${skippedRecent} too recent`);
  
  updateUI();
  return qualifiedCases;
}

// ========== DETAIL PAGE EXTRACTION ==========
function extractCaseDetails() {
  log('INFO', 'Starting enhanced extraction from NC eCourts...');
  
  const details = {
    timestamp: new Date().toISOString(),
    caseNumber: '',
    caseType: 'Estate',
    caseStatus: '',
    filingDate: '',
    county: '',
    parties: {
      decedent: { name: '', address: '', city: '', state: '', zip: '', phone: '' },
      executor: { name: '', address: '', city: '', state: '', zip: '', phone: '' },
      beneficiaries: []
    },
    documents: [],
    events: [],
    sections: {
      parties: '',
      events: '',
      summary: ''
    },
    extractionQuality: 0,
    fullPageText: document.body.innerText
  };
  
  // Extract case number
  const caseMatch = document.body.innerText.match(/\b(\d{2}[eE]\d{6}[\s-]*\d{3})\b/);
  if (caseMatch) {
    details.caseNumber = caseMatch[1].replace(/\s+/g, '').toUpperCase();
    log('DEBUG', `Found case number: ${details.caseNumber}`);
    details.extractionQuality += 20;
  }
  
  // Find and extract Party Information section
  const pageText = document.body.innerText;
  const partyMatch = pageText.match(/Party Information[\s\S]*?(?=Case Events|Case Summary|$)/i);
  if (partyMatch) {
    details.sections.parties = partyMatch[0].trim();
    details.extractionQuality += 15;
    log('DEBUG', 'Found Party Information section');
    
    // Parse parties from the section
    const partyLines = details.sections.parties.split('\n');
    let currentRole = '';
    let currentPerson = {};
    
    partyLines.forEach(line => {
      line = line.trim();
      if (line.includes('Decedent')) {
        currentRole = 'decedent';
      } else if (line.includes('Administrator') || line.includes('Executor')) {
        currentRole = 'executor';
      } else if (line.includes('Beneficiary')) {
        currentRole = 'beneficiary';
      } else if (line.match(/^[A-Z][A-Z\s,]+$/) && currentRole) {
        // This looks like a name (all caps)
        if (currentRole === 'decedent') {
          details.parties.decedent.name = line;
        } else if (currentRole === 'executor') {
          details.parties.executor.name = line;
        } else if (currentRole === 'beneficiary') {
          details.parties.beneficiaries.push({
            name: line,
            address: '',
            relationship: 'Beneficiary'
          });
        }
      } else if (line.match(/\d+.*[A-Z]/) && currentRole) {
        // This looks like an address
        if (currentRole === 'decedent') {
          details.parties.decedent.address += line + ' ';
        } else if (currentRole === 'executor') {
          details.parties.executor.address += line + ' ';
        } else if (currentRole === 'beneficiary' && details.parties.beneficiaries.length > 0) {
          details.parties.beneficiaries[details.parties.beneficiaries.length - 1].address += line + ' ';
        }
      }
    });
    
    log('DEBUG', `Extracted ${details.parties.beneficiaries.length} beneficiaries`);
  }
  
  // Find and extract Case Events section
  const eventsMatch = pageText.match(/Case Events[\s\S]*?(?=Party Information|$)/i);
  if (eventsMatch) {
    details.sections.events = eventsMatch[0].trim();
    details.extractionQuality += 15;
    log('DEBUG', 'Found Case Events section');
    
    // Parse events and look for document links
    const eventBlocks = details.sections.events.split(/\d{2}\/\d{2}\/\d{4}/);
    let eventDates = details.sections.events.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    
    eventBlocks.forEach((block, index) => {
      if (index === 0 || !eventDates[index-1]) return; // Skip header
      
      const event = {
        date: eventDates[index-1],
        description: block.trim(),
        hasDocument: block.includes('document is available') || block.includes('Click here to view')
      };
      
      details.events.push(event);
      
      // If event has document, try to find the link
      if (event.hasDocument) {
        // Look for document type in the event text
        let docType = 'document';
        const typeMatch = block.match(/(Application|Receipt|Proof|Payment|Inventory|Affidavit|Order|Notice|Letter|Report|Petition|Will|Certificate|Authorization|Filing|Statement|Account|Bill|Invoice)/i);
        if (typeMatch) {
          docType = typeMatch[1].toLowerCase();
        }
        
        // Find the actual link element
        const links = document.querySelectorAll('a');
        links.forEach(link => {
          if (link.textContent.includes('Click here to view') || link.textContent.includes('document is available')) {
            // Check if this link is near the event text
            const linkParent = link.closest('tr') || link.parentElement;
            if (linkParent && linkParent.innerText.includes(event.date)) {
              details.documents.push({
                name: `${docType}_${event.date.replace(/\//g, '-')}.pdf`,
                url: link.href,
                type: docType,
                date: event.date,
                context: event.description.substring(0, 200)
              });
            }
          }
        });
      }
    });
    
    log('DEBUG', `Found ${details.events.length} events, ${details.documents.length} documents`);
  }
  
  // Extract county
  const countyMatch = pageText.match(/([A-Za-z\s]+)\s+County/i);
  if (countyMatch) {
    details.county = countyMatch[1].trim();
    details.extractionQuality += 10;
  }
  
  // Check if disposed
  if (pageText.toLowerCase().includes('disposed')) {
    details.caseStatus = 'Disposed';
    details.extractionQuality += 10;
  }
  
  log('INFO', `Extraction complete - Quality: ${details.extractionQuality}%`, {
    caseNumber: details.caseNumber,
    parties: details.parties.beneficiaries.length,
    events: details.events.length,
    documents: details.documents.length
  });
  
  return details;
}

// ========== NATIVE HELPER COMMUNICATION ==========
function sendToNativeHelper(details) {
  log('INFO', 'Attempting to send case details to native helper', { caseNumber: details.caseNumber });
  
  chrome.runtime.sendMessage({
    action: 'sendToNative',
    data: {
      action: 'processCase',
      caseNumber: details.caseNumber,
      details: details
    }
  }, response => {
    if (response && (response.sent || response.queued)) {
      log('INFO', 'Case details sent to native helper', {
        caseNumber: details.caseNumber,
        sent: response.sent,
        queued: response.queued
      });
      const saveBtn = document.getElementById('save-btn');
      if (saveBtn) saveBtn.style.display = 'block';
    } else {
      log('ERROR', 'Failed to send case details to native helper', response);
    }
  });
}

// ========== HUMAN BEHAVIOR SIMULATION ==========
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function simulateHumanTypingDelay() {
  return getRandomDelay(50, 200);
}

function simulateReadingDelay(textLength) {
  // Simplified - just use random delay between configured min/max
  return getRandomDelay(DELAYS.MIN_READING, DELAYS.MAX_READING);
}

function simulateScrolling() {
  // Random scroll movements like a human scanning the page
  const scrollPositions = [0, 0.3, 0.6, 0.9, 0.5, 1.0];
  let index = 0;
  
  return new Promise((resolve) => {
    const scrollInterval = setInterval(() => {
      if (index >= scrollPositions.length) {
        clearInterval(scrollInterval);
        resolve();
        return;
      }
      
      const targetPosition = document.body.scrollHeight * scrollPositions[index];
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
      
      index++;
    }, getRandomDelay(800, 1500));
  });
}

function simulateMouseMovement() {
  const event = new MouseEvent('mousemove', {
    clientX: getRandomDelay(100, window.innerWidth - 100),
    clientY: getRandomDelay(100, window.innerHeight - 100),
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(event);
}

// ========== AUTO-PROCESSING WITH NEW TAB HANDLING ==========
async function processNextCase() {
  if (!isProcessing || currentProcessingIndex >= qualifiedCases.length) {
    log('INFO', 'Auto-processing complete');
    isProcessing = false;
    updateUI();
    return;
  }
  
  const currentCase = qualifiedCases[currentProcessingIndex];
  log('INFO', `Processing case ${currentProcessingIndex + 1}/${qualifiedCases.length}: ${currentCase.caseNumber}`);
  
  updateCaseList();
  
  // Human-like delay before clicking
  const readingTime = getRandomDelay(DELAYS.MIN_READING, DELAYS.MAX_READING);
  log('DEBUG', `Reading delay: ${readingTime}ms`);
  
  setTimeout(() => {
    simulateMouseMovement();
    
    setTimeout(() => {
      log('INFO', `Clicking case ${currentCase.caseNumber} - will open in new tab`);
      
      // Store state before clicking (link will open in new tab)
      chrome.storage.local.set({
        autoProcessState: {
          qualifiedCases: qualifiedCases,
          currentIndex: currentProcessingIndex,
          isProcessing: true,
          resultsTabUrl: window.location.href
        }
      }, () => {
        // Click the link - NC eCourts opens it in a new tab
        if (currentCase.element && currentCase.element.click) {
          currentCase.element.click();
          log('DEBUG', 'Clicked case link - should open in new tab');
          
          // Increment index for next case
          currentProcessingIndex++;
          
          // Wait for the new tab to process, then continue
          setTimeout(() => {
            processNextCase();
          }, getRandomDelay(DELAYS.MIN_BETWEEN_CASES, DELAYS.MAX_BETWEEN_CASES));
        } else {
          log('ERROR', 'No element to click for case');
          currentProcessingIndex++;
          processNextCase();
        }
      });
    }, getRandomDelay(DELAYS.MIN_BEFORE_CLICK, DELAYS.MAX_BEFORE_CLICK));
  }, readingTime);
}

// ========== CASE DETAIL PROCESSING WITH DELAYS ==========
async function processDetailPage(details) {
  log('INFO', 'Processing detail page with human delays...');
  
  // Simulate reading the page
  await simulateScrolling();
  
  // Wait as if reading the content
  const readingTime = getRandomDelay(DELAYS.MIN_READING, DELAYS.MAX_READING);
  log('DEBUG', `Reading page for ${readingTime}ms`);
  await new Promise(resolve => setTimeout(resolve, readingTime));
  
  // Random pause as if considering the information
  const thinkingTime = getRandomDelay(DELAYS.MIN_THINKING, DELAYS.MAX_THINKING);
  log('DEBUG', `Thinking delay: ${thinkingTime}ms`);
  await new Promise(resolve => setTimeout(resolve, thinkingTime));
  
  // Send to native helper
  log('DEBUG', 'Sending details to native helper', details);
  sendToNativeHelper(details);
  
  // Wait before going back
  const afterProcessDelay = getRandomDelay(DELAYS.MIN_BETWEEN_CASES, DELAYS.MAX_BETWEEN_CASES);
  log('DEBUG', `Post-process delay: ${afterProcessDelay}ms`);
  await new Promise(resolve => setTimeout(resolve, afterProcessDelay));
  
  // Go back to results
  if (qualifiedCases.length > currentProcessingIndex + 1) {
    log('INFO', 'Returning to results page for next case');
    window.history.back();
  } else {
    log('INFO', 'No more cases to process');
    isProcessing = false;
    updateUI();
  }
}

// ========== UI INJECTION AND UPDATES ==========
function injectUI() {
  // Remove existing UI if present
  const existingUI = document.getElementById('estate-processor-ui');
  if (existingUI) existingUI.remove();
  
  const ui = document.createElement('div');
  ui.id = 'estate-processor-ui';
  ui.innerHTML = `
    <div id="estate-panel">
      <div class="panel-header" style="cursor: move;">
        <h3>Estates Processor V3</h3>
        <span id="native-indicator" class="indicator">●</span>
        <button id="close-btn" style="background: #EF4444; margin-right: 5px;">X</button>
        <button id="minimize-btn">_</button>
      </div>
      <div class="panel-body">
        <div class="status-section">
          <div>Page: <span id="page-type">Detecting...</span></div>
          <div>Native: <span id="native-status">Checking...</span></div>
          <div>Qualified: <span id="qualified-count">0</span> cases</div>
        </div>
        
        <div class="criteria-box">
          <strong>Criteria:</strong>
          <ul>
            <li>Disposed by Clerk</li>
            <li>2+ years old</li>
            <li>Skip pending (respect grieving)</li>
          </ul>
        </div>
        
        <div class="controls">
          <button id="scan-btn" class="btn btn-primary">Scan Results</button>
          <button id="test-btn" class="btn btn-secondary">Test Mode</button>
          <button id="extract-btn" class="btn btn-primary" style="display:none;">Extract Details</button>
          <button id="save-btn" class="btn btn-success" style="display:none;">Save to Folder</button>
          <button id="auto-btn" class="btn btn-warning" style="display:none;">Auto-Process All</button>
        </div>
        
        <div class="delay-info" style="display:none;" id="delay-info">
          <strong>Human Delays Active:</strong>
          <div id="delay-status">Waiting...</div>
          <div class="delay-progress" id="delay-progress"></div>
        </div>
        
        <div id="qualified-list" class="case-list" style="display:none;"></div>
        
        <div id="estate-log" class="log-area"></div>
      </div>
    </div>
    
    <style>
      #estate-processor-ui {
        position: fixed;
        right: 10px;
        top: 10px;
        z-index: 10000;
        font-family: Arial, sans-serif;
      }
      
      #estate-panel {
        background: #2d3748;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.5);
        color: white;
        min-width: 300px;
        max-width: 400px;
      }
      
      .panel-header {
        background: #7C3AED;
        padding: 10px;
        border-radius: 8px 8px 0 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .panel-header h3 {
        margin: 0;
        font-size: 16px;
        flex-grow: 1;
      }
      
      .panel-header button {
        background: transparent;
        border: 1px solid white;
        color: white;
        padding: 2px 8px;
        cursor: pointer;
        margin-left: 5px;
      }
      
      .panel-body {
        padding: 15px;
      }
      
      .status-section {
        margin-bottom: 15px;
      }
      
      .criteria-box {
        background: rgba(0,0,0,0.2);
        padding: 10px;
        border-radius: 4px;
        margin: 10px 0;
      }
      
      .criteria-box ul {
        margin: 5px 0;
        padding-left: 20px;
      }
      
      .controls {
        margin: 15px 0;
      }
      
      .controls button {
        display: block;
        width: 100%;
        padding: 8px;
        margin: 5px 0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
      }
      
      .btn-primary { background: #3B82F6; color: white; }
      .btn-secondary { background: #6B7280; color: white; }
      .btn-success { background: #10B981; color: white; }
      .btn-warning { background: #F59E0B; color: white; }
      
      .log-area {
        background: black;
        color: #00FF00;
        padding: 10px;
        max-height: 150px;
        overflow-y: auto;
        font-family: monospace;
        font-size: 12px;
        border-radius: 4px;
      }
      
      .log-entry {
        margin: 2px 0;
      }
      
      .log-entry.log-error { color: #FF6B6B; }
      .log-entry.log-warn { color: #FFD93D; }
      .log-entry.log-info { color: #6BCF7F; }
      .log-entry.log-debug { color: #A0A0A0; }
      
      .indicator {
        font-size: 20px;
        margin-right: 10px;
      }
      
      .indicator.connected { color: #10B981; }
      .indicator.disconnected { color: #EF4444; }
      .indicator.connecting { color: #F59E0B; animation: spin 1s linear infinite; }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  
  document.body.appendChild(ui);
  setupEventListeners();
  updateUI();
  
  // Check native connection after a short delay to ensure everything is ready
  setTimeout(() => {
    checkNativeConnection();
  }, 100);
}

function updateUI() {
  // Update qualified count
  document.getElementById('qualified-count').textContent = qualifiedCases.length;
  
  // Show/hide auto-process button
  const autoBtn = document.getElementById('auto-btn');
  if (qualifiedCases.length > 0) {
    autoBtn.style.display = 'block';
  } else {
    autoBtn.style.display = 'none';
  }
  
  // Update page type
  const pageType = detectPageType();
  document.getElementById('page-type').textContent = pageType || 'Unknown';
  
  // Show appropriate buttons based on page type
  if (pageType === 'results') {
    document.getElementById('scan-btn').style.display = 'block';
  } else if (pageType === 'detail' || pageType === null) {
    // Show extract button on detail pages or unknown pages (likely detail)
    document.getElementById('extract-btn').style.display = 'block';
  }
}

function updateCaseList() {
  const listDiv = document.getElementById('qualified-list');
  if (!listDiv) return;
  
  if (qualifiedCases.length > 0) {
    listDiv.style.display = 'block';
    listDiv.innerHTML = '<strong>Qualified Cases:</strong><br>';
    
    qualifiedCases.forEach((case_, index) => {
      const item = document.createElement('div');
      item.className = 'case-item';
      
      if (index === currentProcessingIndex && isProcessing) {
        item.style.cssText = 'background: #F59E0B; color: black; padding: 5px; margin: 2px 0;';
        item.textContent = `► ${case_.caseNumber} - Processing...`;
      } else {
        item.style.cssText = 'padding: 5px; margin: 2px 0;';
        item.textContent = `${case_.caseNumber} - ${case_.decedentName}`;
      }
      
      listDiv.appendChild(item);
    });
  } else {
    listDiv.style.display = 'none';
  }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  // Close button
  document.getElementById('close-btn').addEventListener('click', () => {
    const panel = document.getElementById('estate-processor-ui');
    panel.style.display = 'none';
  });
  
  // Minimize button
  document.getElementById('minimize-btn').addEventListener('click', () => {
    const body = document.querySelector('.panel-body');
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  });
  
  // Make panel draggable
  const panel = document.getElementById('estate-processor-ui');
  const header = document.querySelector('.panel-header');
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;
  
  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  
  function dragStart(e) {
    if (e.target.tagName === 'BUTTON') return;
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    isDragging = true;
  }
  
  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    xOffset = currentX;
    yOffset = currentY;
    panel.style.transform = `translate(${currentX}px, ${currentY}px)`;
  }
  
  function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }
  
  // Scan button
  document.getElementById('scan-btn').addEventListener('click', () => {
    scanForQualifiedCases();
    if (qualifiedCases.length > 0) {
      updateCaseList();
    }
  });
  
  // Test mode button
  document.getElementById('test-btn').addEventListener('click', () => {
    log('INFO', 'Running test mode...');
    chrome.runtime.sendMessage({
      action: 'sendToNative',
      data: {
        action: 'testMode'
      }
    }, response => {
      log('INFO', 'Test mode response received', response);
    });
  });
  
  // Extract button
  document.getElementById('extract-btn').addEventListener('click', () => {
    const details = extractCaseDetails();
    sendToNativeHelper(details);
    document.getElementById('save-btn').style.display = 'block';
  });
  
  // Check native connection immediately after UI is injected
  setTimeout(() => {
    checkNativeConnection();
    // Check again every 5 seconds
    setInterval(checkNativeConnection, 5000);
  }, 500);
  
  // Save button
  document.getElementById('save-btn').addEventListener('click', () => {
    const details = extractCaseDetails();
    sendToNativeHelper(details);
    log('INFO', 'Saving case to folder...');
  });
  
  // Auto-process button
  document.getElementById('auto-btn').addEventListener('click', () => {
    if (qualifiedCases.length > 0) {
      log('INFO', 'Starting auto-processing...');
      isProcessing = true;
      currentProcessingIndex = 0;
      processNextCase();
    }
  });
}

// ========== NATIVE CONNECTION CHECK ==========
function checkNativeConnection(initial = false) {
  console.log('[Estates] Checking native connection...');
  chrome.runtime.sendMessage({ action: 'checkConnection' }, response => {
    console.log('[Estates] Native connection response:', response);
    const indicator = document.getElementById('native-indicator');
    const status = document.getElementById('native-status');
    
    if (!indicator || !status) {
      console.log('[Estates] UI elements not found yet');
      return;
    }
    
    if (!response) {
      nativeConnected = false;
      indicator.className = 'indicator disconnected';
      status.textContent = 'No Response';
      log('WARN', 'No response from background');
      return;
    }
    
    const hasPort = response.hasPort || false;
    const connected = response.connected || false;
    const statusText = response.status || 'unknown';
    
    nativeConnected = connected;
    
    if (connected) {
      indicator.className = 'indicator connected';
      indicator.textContent = '●';
      status.textContent = 'Connected';
      status.style.color = '#10B981';
      log('SUCCESS', '✓ Native helper connected');
      console.log('[Estates] ✓ Native ready');
    } else if (hasPort) {
      indicator.className = 'indicator connecting';
      indicator.textContent = '⟳';
      status.textContent = 'Connecting...';
      status.style.color = '#F59E0B';
      log('INFO', '⟳ Port open, awaiting confirmation');
      console.log('[Estates] ⟳ Connecting to native helper...');
    } else {
      indicator.className = 'indicator disconnected';
      indicator.textContent = '✗';
      status.textContent = 'Not Connected';
      status.style.color = '#EF4444';
      log('WARN', '✗ Native helper not connected');
      console.log('[Estates] ✗ No connection to native helper');
    }
    
    console.log('[Estates] Connection details:', {
      connected: connected,
      hasPort: hasPort,
      status: statusText,
      attempts: response.attempts
    });
  });
}

// ========== MESSAGE HANDLER ==========
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'nativeResponse') {
    log('INFO', 'Native response:', request.data);
  } else if (request.action === 'processDetailPage' && request.isNewTab) {
    // This tab is a detail page opened in a new tab
    log('INFO', 'Detail page detected in new tab - processing...');
    
    // Wait for page to fully load
    setTimeout(async () => {
      const details = extractCaseDetails();
      await processDetailPage(details);
      
      // Close this tab after processing
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'closeCurrentTabAndFocusResults'
        });
      }, 3000);
    }, 3000);
  } else if (request.action === 'resultsPageIdentified') {
    log('INFO', 'This is the results page');
    chrome.runtime.sendMessage({
      action: 'markResultsTab'
    });
  }
});

// ========== INITIALIZATION ==========
function init() {
  log('INFO', 'Initializing Estates Processor V3...');
  
  // Load NC eCourts specific extractor
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('nc-ecourts-extractor.js');
  script.onload = () => {
    log('INFO', 'NC eCourts extractor loaded');
  };
  document.head.appendChild(script);
  
  // Add keyboard shortcut to toggle panel (Alt+E)
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'e') {
      const panel = document.getElementById('estate-processor-ui');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      } else {
        injectUI();
      }
    }
  });
  
  // Inject UI
  injectUI();
  
  // Check for auto-processing state
  chrome.storage.local.get('autoProcessState', async (result) => {
    if (result.autoProcessState && result.autoProcessState.isProcessing) {
      const state = result.autoProcessState;
      let pageType = detectPageType();
      
      // Force detection as detail page if we're auto-processing and not on results
      if (!pageType && state.isProcessing) {
        const bodyText = document.body.innerText.toLowerCase();
        if (!bodyText.includes('search results') && !bodyText.includes('displaying')) {
          log('INFO', 'Auto-processing mode - assuming detail page');
          pageType = 'detail';
        }
      }
      
      if (pageType === 'detail') {
        // We're on a detail page during auto-processing
        log('INFO', 'Resuming auto-processing on detail page...');
        
        // Add random initial delay to seem more human
        const initialDelay = getRandomDelay(2000, 4000);
        log('DEBUG', `Initial page load delay: ${initialDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, initialDelay));
        
        // Extract and process with human delays
        const details = extractCaseDetails();
        await processDetailPage(details);
        
        // Update state for next case
        currentProcessingIndex = state.currentIndex + 1;
        qualifiedCases = state.qualifiedCases; // Restore the array
        
        chrome.storage.local.set({
          autoProcessState: {
            ...state,
            currentIndex: currentProcessingIndex
          }
        });
        
        if (currentProcessingIndex >= state.qualifiedCases.length) {
          // Processing complete
          chrome.storage.local.remove('autoProcessState');
          log('INFO', 'All cases processed');
        }
      }
    }
  });
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
