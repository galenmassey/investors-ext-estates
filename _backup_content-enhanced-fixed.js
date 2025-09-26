// Content script for NC Estates Auto-Processor V3.0 - Complete Rewrite for Goals
console.log('Estates Auto-Processor V3.0 - Goal-Focused Version');

// ========== CONFIGURATION ==========
const MIN_ESTATE_AGE_YEARS = 2;
const DEBUG_MODE = true;

// Human behavior delay settings (in milliseconds)
const DELAYS = {
  MIN_READING: 3000,      // Minimum time to "read" a page
  MAX_READING: 8000,      // Maximum time to "read" a page
  MIN_THINKING: 2000,     // Minimum "thinking" time
  MAX_THINKING: 5000,     // Maximum "thinking" time
  MIN_BEFORE_CLICK: 500,  // Minimum delay before clicking
  MAX_BEFORE_CLICK: 2000, // Maximum delay before clicking
  MIN_BETWEEN_CASES: 8000,// Minimum delay between processing cases
  MAX_BETWEEN_CASES: 15000,// Maximum delay between processing cases
  MIN_BETWEEN_PDFS: 5000, // Minimum delay between PDF downloads
  MAX_BETWEEN_PDFS: 12000, // Maximum delay between PDF downloads
  SCROLL_MIN: 800,        // Minimum time between scroll movements
  SCROLL_MAX: 1500        // Maximum time between scroll movements
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

// ========== SMART PAGE DETECTION ==========
function detectPageType() {
  const url = window.location.href.toLowerCase();
  const bodyText = document.body.innerText.toLowerCase();
  const allTables = document.querySelectorAll('table');
  
  // Look for tables that contain case information
  let hasCaseInfoTable = false;
  let hasPartyTable = false;
  let hasDocketTable = false;
  
  allTables.forEach(table => {
    const tableText = table.innerText.toLowerCase();
    if (tableText.includes('case number') || tableText.includes('filing date') || 
        tableText.includes('case type') || tableText.includes('case status')) {
      hasCaseInfoTable = true;
    }
    if (tableText.includes('party type') || tableText.includes('party name') || 
        tableText.includes('petitioner') || tableText.includes('respondent')) {
      hasPartyTable = true;
    }
    if (tableText.includes('docket') || tableText.includes('register of actions') || 
        tableText.includes('filed date') || tableText.includes('document')) {
      hasDocketTable = true;
    }
  });
  
  // Detail page detection
  if (hasCaseInfoTable || hasPartyTable || hasDocketTable) {
    log('DEBUG', `Detected DETAIL page (tables: case=${hasCaseInfoTable}, party=${hasPartyTable}, docket=${hasDocketTable})`);
    return 'detail';
  }
  
  // URL-based detection
  if (url.includes('casedetail') || url.includes('case_detail') || url.includes('viewcase')) {
    log('DEBUG', 'Detected DETAIL page via URL');
    return 'detail';
  }
  
  // Results page detection
  if (bodyText.includes('search results') || bodyText.includes('cases found') || 
      bodyText.includes('displaying') && bodyText.includes('records')) {
    log('DEBUG', 'Detected RESULTS page');
    return 'results';
  }
  
  // Count estate case numbers
  const caseNumberPattern = /\d{2}[eE]\d{6}[\s-]*\d{3}/gi;
  const matches = bodyText.match(caseNumberPattern);
  if (matches) {
    if (matches.length === 1) {
      log('DEBUG', 'Detected DETAIL page (single case number)');
      return 'detail';
    } else if (matches.length > 1) {
      log('DEBUG', 'Detected RESULTS page (multiple case numbers)');
      return 'results';
    }
  }
  
  log('DEBUG', `Page type unknown - Tables found: ${allTables.length}`);
  return null;
}

// ========== INTELLIGENT EXTRACTION ==========
function extractCaseDetails() {
  log('INFO', 'Starting intelligent extraction...');
  
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
    extractionQuality: 0, // Track how much we extracted
    fullPageText: document.body.innerText
  };
  
  // Method 1: Table-based extraction
  const allTables = document.querySelectorAll('table');
  
  allTables.forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    
    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      
      // Case information extraction
      for (let i = 0; i < cells.length - 1; i++) {
        const label = cells[i].innerText.trim().toLowerCase();
        const value = cells[i + 1]?.innerText.trim() || '';
        
        if (label.includes('case number') || label.includes('case no')) {
          details.caseNumber = value.replace(/\s+/g, '');
          details.extractionQuality += 20;
          log('DEBUG', `Found case number: ${details.caseNumber}`);
        }
        if (label.includes('filing date') || label.includes('filed date')) {
          details.filingDate = value;
          details.extractionQuality += 10;
          log('DEBUG', `Found filing date: ${details.filingDate}`);
        }
        if (label.includes('status')) {
          details.caseStatus = value;
          details.extractionQuality += 10;
        }
        if (label.includes('county')) {
          details.county = value;
          details.extractionQuality += 5;
        }
      }
      
      // Party extraction (looking for party tables)
      if (cells.length >= 3) {
        const firstCell = cells[0].innerText.toLowerCase();
        
        // Decedent/Estate
        if (firstCell.includes('petitioner') || firstCell.includes('estate of') || 
            firstCell.includes('decedent')) {
          const name = cells[1]?.innerText.trim() || '';
          if (name && !name.toLowerCase().includes('party')) {
            details.parties.decedent.name = name;
            
            // Try to get address from subsequent cells or rows
            if (cells[2]) details.parties.decedent.address = cells[2].innerText.trim();
            if (cells[3]) details.parties.decedent.city = cells[3].innerText.trim();
            if (cells[4]) details.parties.decedent.state = cells[4].innerText.trim();
            if (cells[5]) details.parties.decedent.zip = cells[5].innerText.trim();
            
            details.extractionQuality += 15;
            log('DEBUG', `Found decedent: ${name}`);
          }
        }
        
        // Executor/Administrator
        if (firstCell.includes('administrator') || firstCell.includes('executor') || 
            firstCell.includes('personal representative')) {
          const name = cells[1]?.innerText.trim() || '';
          if (name && !name.toLowerCase().includes('party')) {
            details.parties.executor.name = name;
            
            // Address extraction
            if (cells[2]) details.parties.executor.address = cells[2].innerText.trim();
            if (cells[3]) details.parties.executor.city = cells[3].innerText.trim();
            if (cells[4]) details.parties.executor.state = cells[4].innerText.trim();
            if (cells[5]) details.parties.executor.zip = cells[5].innerText.trim();
            
            details.extractionQuality += 15;
            log('DEBUG', `Found executor: ${name}`);
          }
        }
        
        // Beneficiaries/Heirs
        if (firstCell.includes('heir') || firstCell.includes('beneficiary') || 
            firstCell.includes('devisee')) {
          const name = cells[1]?.innerText.trim() || '';
          if (name && !name.toLowerCase().includes('party')) {
            const beneficiary = {
              name: name,
              address: cells[2]?.innerText.trim() || '',
              city: cells[3]?.innerText.trim() || '',
              state: cells[4]?.innerText.trim() || '',
              zip: cells[5]?.innerText.trim() || '',
              phone: cells[6]?.innerText.trim() || ''
            };
            details.parties.beneficiaries.push(beneficiary);
            details.extractionQuality += 10;
            log('DEBUG', `Found beneficiary: ${name}`);
          }
        }
      }
    });
  });
  
  // Method 2: Fallback text extraction if tables didn't work
  if (!details.caseNumber) {
    const caseMatch = document.body.innerText.match(/\d{2}[eE]\d{6}[\s-]*\d{3}/i);
    if (caseMatch) {
      details.caseNumber = caseMatch[0].replace(/\s+/g, '');
      details.extractionQuality += 10;
      log('DEBUG', `Fallback case number: ${details.caseNumber}`);
    }
  }
  
  if (!details.parties.decedent.name) {
    const estateMatch = document.body.innerText.match(/(?:Estate of|IN THE MATTER OF)\s+([A-Z][A-Z\s,.-]+?)(?:\n|,|\.|$)/i);
    if (estateMatch) {
      details.parties.decedent.name = estateMatch[1].trim();
      details.extractionQuality += 5;
      log('DEBUG', `Fallback decedent: ${details.parties.decedent.name}`);
    }
  }
  
  // Document extraction - PRIORITIZE OLDEST/BOTTOM DOCUMENTS
  const pdfLinks = Array.from(document.querySelectorAll('a[href*=".pdf"]'));
  const docRows = [];
  
  pdfLinks.forEach(link => {
    // Try to find the date in the same row
    const row = link.closest('tr');
    let date = 'Unknown';
    
    if (row) {
      const dateMatch = row.innerText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (dateMatch) date = dateMatch[0];
    }
    
    docRows.push({
      url: link.href,
      name: link.textContent.trim() || 'Document',
      date: date,
      dateObj: date !== 'Unknown' ? new Date(date) : new Date(0)
    });
  });
  
  // Sort by date - OLDEST FIRST (bottom of docket)
  docRows.sort((a, b) => a.dateObj - b.dateObj);
  details.documents = docRows.map(d => ({ url: d.url, name: d.name, date: d.date }));
  
  if (details.documents.length > 0) {
    details.extractionQuality += 20;
    log('INFO', `Found ${details.documents.length} documents (sorted oldest first for contact info)`);
  }
  
  log('INFO', `Extraction complete - Quality: ${details.extractionQuality}%`, {
    caseNumber: details.caseNumber,
    decedent: details.parties.decedent.name,
    executor: details.parties.executor.name,
    beneficiaries: details.parties.beneficiaries.length,
    documents: details.documents.length
  });
  
  return details;
}

// ========== INTELLIGENT DOCUMENT PROCESSING ==========
async function processDocuments(details) {
  log('INFO', 'Processing documents with human-like delays...');
  
  if (details.documents.length === 0) {
    log('WARN', 'No documents to process');
    return;
  }
  
  // Process each document with delays
  for (let i = 0; i < details.documents.length; i++) {
    const doc = details.documents[i];
    log('INFO', `Processing document ${i + 1}/${details.documents.length}: ${doc.name}`);
    
    // Send document info to native helper for download
    chrome.runtime.sendMessage({
      action: 'sendToNative',
      data: {
        action: 'downloadDocument',
        caseNumber: details.caseNumber,
        document: doc,
        index: i,
        total: details.documents.length
      }
    });
    
    // Human-like delay between downloads
    if (i < details.documents.length - 1) {
      const delay = getRandomDelay(DELAYS.MIN_BETWEEN_PDFS, DELAYS.MAX_BETWEEN_PDFS);
      log('DEBUG', `Waiting ${delay}ms before next document...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ========== COMPLETE CASE PROCESSING ==========
async function processDetailPage(details) {
  log('INFO', 'Processing complete case with all data...');
  
  // Check extraction quality
  if (details.extractionQuality < 30) {
    log('WARN', `Low extraction quality (${details.extractionQuality}%) - may need manual review`);
  }
  
  // Save case details first
  chrome.runtime.sendMessage({
    action: 'sendToNative',
    data: {
      action: 'saveCase',
      caseNumber: details.caseNumber,
      details: details
    }
  }, async response => {
    if (response && response.sent) {
      log('INFO', 'Case details saved');
      
      // Now process documents
      await processDocuments(details);
      
      // Optional: Upload to Supabase
      if (details.extractionQuality >= 50) {
        uploadToSupabase(details);
      }
    }
  });
  
  // Simulate reading/thinking
  await simulateScrolling();
  const thinkingTime = getRandomDelay(DELAYS.MIN_THINKING, DELAYS.MAX_THINKING);
  await new Promise(resolve => setTimeout(resolve, thinkingTime));
  
  // Continue to next case or finish
  if (isProcessing && currentProcessingIndex < qualifiedCases.length - 1) {
    const nextDelay = getRandomDelay(DELAYS.MIN_BETWEEN_CASES, DELAYS.MAX_BETWEEN_CASES);
    log('INFO', `Moving to next case in ${nextDelay}ms...`);
    await new Promise(resolve => setTimeout(resolve, nextDelay));
    
    // Go back to results
    window.history.back();
  } else {
    log('INFO', 'All cases processed!');
    isProcessing = false;
    updateUI();
  }
}

// ========== SUPABASE UPLOAD (OPTIONAL) ==========
function uploadToSupabase(details) {
  // This would require your Supabase credentials
  log('INFO', 'Ready for Supabase upload (configure in settings)');
  
  // Example structure:
  // chrome.runtime.sendMessage({
  //   action: 'uploadToSupabase',
  //   data: {
  //     bucket: 'estates',
  //     path: `${details.county}/${details.caseNumber}/`,
  //     details: details
  //   }
  // });
}

// ========== HUMAN BEHAVIOR SIMULATION ==========
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function simulateScrolling() {
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
    }, getRandomDelay(DELAYS.SCROLL_MIN, DELAYS.SCROLL_MAX));
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

// ========== RESULTS PAGE SCANNING ==========
function scanForQualifiedCases() {
  log('INFO', 'Scanning for qualified estate cases...');
  qualifiedCases = [];
  
  const currentYear = new Date().getFullYear();
  let totalEstates = 0;
  let skippedPending = 0;
  let skippedRecent = 0;
  
  const pageText = document.body.innerText;
  const lines = pageText.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/\d{2}E\d{6}[\s-]*\d{3}/)) {
      const context = lines.slice(i, i + 5).join(' ');
      const caseMatch = context.match(/(\d{2}E\d{6}[\s-]*\d{3})/);
      
      if (!caseMatch) continue;
      
      const caseNumber = caseMatch[1].replace(/\s+/g, '');
      
      if (!context.toUpperCase().includes('ESTATE')) continue;
      
      totalEstates++;
      
      // Check status
      if (context.includes('Pending')) {
        skippedPending++;
        continue;
      }
      
      if (!context.includes('Disposed') || !context.includes('Clerk')) {
        skippedPending++;
        continue;
      }
      
      // Check age
      const yearMatch = caseNumber.match(/^(\d{2})E/);
      if (yearMatch) {
        const caseYear = 2000 + parseInt(yearMatch[1]);
        const caseAge = currentYear - caseYear;
        
        if (caseAge < MIN_ESTATE_AGE_YEARS) {
          skippedRecent++;
          continue;
        }
      }
      
      // Extract name
      let decedentName = 'Unknown';
      const nameMatch = context.match(/(?:ESTATE OF|IN THE MATTER OF)\s+(?:THE ESTATE OF\s+)?([A-Z][A-Z\s]+)/i);
      if (nameMatch) {
        decedentName = nameMatch[1].trim().split(/\s{2,}/)[0];
      }
      
      // Find the link
      let caseLink = null;
      const allLinks = document.querySelectorAll('a');
      for (let link of allLinks) {
        if (link.textContent && link.textContent.includes(caseNumber.replace('-', ''))) {
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
  
  log('INFO', `Scan complete: ${qualifiedCases.length} qualified (${skippedPending} pending, ${skippedRecent} recent)`);
  updateUI();
  return qualifiedCases;
}

// ========== AUTO-PROCESSING ==========
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
      // Store state and navigate
      chrome.storage.local.set({
        autoProcessState: {
          qualifiedCases: qualifiedCases,
          currentIndex: currentProcessingIndex,
          isProcessing: true
        }
      }, () => {
        if (currentCase.element && currentCase.element.click) {
          currentCase.element.click();
        } else if (currentCase.link) {
          window.location.href = currentCase.link;
        } else {
          log('ERROR', 'No navigation method available');
          currentProcessingIndex++;
          processNextCase();
        }
      });
    }, getRandomDelay(DELAYS.MIN_BEFORE_CLICK, DELAYS.MAX_BEFORE_CLICK));
  }, readingTime);
}

// ========== UI COMPONENTS ==========
function injectUI() {
  const existingUI = document.getElementById('estate-processor-ui');
  if (existingUI) existingUI.remove();
  
  const ui = document.createElement('div');
  ui.id = 'estate-processor-ui';
  ui.innerHTML = `
    <div id="estate-panel">
      <div class="panel-header" style="cursor: move;">
        <h3>Estates Processor V3</h3>
        <span id="native-indicator" class="indicator">●</span>
        <button id="close-btn" style="background: #EF4444;">X</button>
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
          <button id="extract-btn" class="btn btn-primary" style="display:none;">Extract & Download</button>
          <button id="auto-btn" class="btn btn-warning" style="display:none;">Auto-Process All</button>
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
        min-width: 350px;
        max-width: 450px;
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
        padding: 10px;
        margin: 8px 0;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      }
      
      .btn-primary { background: #3B82F6; color: white; }
      .btn-warning { background: #F59E0B; color: white; }
      
      .log-area {
        background: black;
        color: #00FF00;
        padding: 10px;
        max-height: 150px;
        overflow-y: auto;
        font-family: monospace;
        font-size: 11px;
        border-radius: 4px;
      }
      
      .log-entry { margin: 2px 0; }
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
      
      .case-list {
        max-height: 200px;
        overflow-y: auto;
        background: rgba(0,0,0,0.2);
        padding: 10px;
        border-radius: 4px;
        margin: 10px 0;
      }
      
      .case-item {
        padding: 5px;
        margin: 2px 0;
        border-radius: 2px;
      }
      
      .case-item.processing {
        background: #F59E0B;
        color: black;
      }
    </style>
  `;
  
  document.body.appendChild(ui);
  setupEventListeners();
  updateUI();
  checkNativeConnection();
}

function updateUI() {
  document.getElementById('qualified-count').textContent = qualifiedCases.length;
  
  const autoBtn = document.getElementById('auto-btn');
  if (qualifiedCases.length > 0) {
    autoBtn.style.display = 'block';
  } else {
    autoBtn.style.display = 'none';
  }
  
  const pageType = detectPageType();
  document.getElementById('page-type').textContent = pageType || 'Unknown';
  
  if (pageType === 'results') {
    document.getElementById('scan-btn').style.display = 'block';
    document.getElementById('extract-btn').style.display = 'none';
  } else if (pageType === 'detail') {
    document.getElementById('scan-btn').style.display = 'none';
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
      item.className = index === currentProcessingIndex && isProcessing ? 'case-item processing' : 'case-item';
      item.textContent = `${index === currentProcessingIndex && isProcessing ? '► ' : ''}${case_.caseNumber} - ${case_.decedentName}`;
      listDiv.appendChild(item);
    });
  } else {
    listDiv.style.display = 'none';
  }
}

function setupEventListeners() {
  // Close button
  document.getElementById('close-btn').addEventListener('click', () => {
    document.getElementById('estate-processor-ui').style.display = 'none';
  });
  
  // Minimize button
  document.getElementById('minimize-btn').addEventListener('click', () => {
    const body = document.querySelector('.panel-body');
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  });
  
  // Scan button
  document.getElementById('scan-btn').addEventListener('click', () => {
    scanForQualifiedCases();
    updateCaseList();
  });
  
  // Extract button - NOW AUTOMATIC DOWNLOAD
  document.getElementById('extract-btn').addEventListener('click', async () => {
    log('INFO', 'Manual extraction and download started');
    const details = extractCaseDetails();
    
    if (details.extractionQuality < 30) {
      if (!confirm(`Low extraction quality (${details.extractionQuality}%). Continue anyway?`)) {
        return;
      }
    }
    
    await processDetailPage(details);
    log('INFO', 'Manual extraction complete');
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
  
  // Make panel draggable
  const panel = document.getElementById('estate-processor-ui');
  const header = document.querySelector('.panel-header');
  let isDragging = false;
  let currentX, currentY, initialX, initialY;
  let xOffset = 0, yOffset = 0;
  
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
}

function checkNativeConnection() {
  chrome.runtime.sendMessage({ action: 'checkConnection' }, response => {
    const indicator = document.getElementById('native-indicator');
    const status = document.getElementById('native-status');
    
    if (response && response.connected) {
      nativeConnected = true;
      indicator.className = 'indicator connected';
      status.textContent = 'Connected';
      log('INFO', 'Native helper connected');
    } else {
      nativeConnected = false;
      indicator.className = 'indicator disconnected';
      status.textContent = 'Not connected';
      log('WARN', 'Native helper not connected - files cannot be saved');
    }
  });
}

// ========== INITIALIZATION ==========
function init() {
  log('INFO', 'Initializing Estates Processor V3 - Goal-Focused Version');
  
  // Keyboard shortcut (Alt+E)
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
  
  injectUI();
  
  // Check for auto-processing state
  chrome.storage.local.get('autoProcessState', async (result) => {
    if (result.autoProcessState && result.autoProcessState.isProcessing) {
      const state = result.autoProcessState;
      const pageType = detectPageType();
      
      // Force detail page in auto-processing
      if (pageType === 'detail' || state.isProcessing) {
        log('INFO', 'Resuming auto-processing on detail page...');
        
        // Restore state
        qualifiedCases = state.qualifiedCases;
        currentProcessingIndex = state.currentIndex;
        isProcessing = true;
        
        // Wait for page to settle
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Extract and process
        const details = extractCaseDetails();
        await processDetailPage(details);
        
        // Update for next case
        currentProcessingIndex++;
        
        if (currentProcessingIndex < qualifiedCases.length) {
          chrome.storage.local.set({
            autoProcessState: {
              ...state,
              currentIndex: currentProcessingIndex
            }
          });
        } else {
          chrome.storage.local.remove('autoProcessState');
          log('INFO', 'All cases processed!');
        }
      }
    }
  });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}