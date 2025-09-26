// NC eCourts Specific Extraction Module
// This file contains the exact selectors and patterns for NC eCourts portal

// ========== NC ECOURTS SPECIFIC EXTRACTION ==========
function extractCaseDetailsNCeCourts() {
  log('INFO', 'Extracting from NC eCourts structure...');
  
  const details = {
    timestamp: new Date().toISOString(),
    caseNumber: '',
    caseType: 'Estate',
    caseStatus: '',
    filingDate: '',
    county: '',
    parties: {
      decedent: { name: '', address: '', city: '', state: '', zip: '', phone: '' },
      executor: { name: '', address: '', city: '', state: '', zip: '', phone: '', email: '' },
      beneficiaries: []
    },
    documents: [],
    events: [],
    extractionQuality: 0,
    fullPageText: document.body.innerText
  };
  
  // 1. CASE NUMBER EXTRACTION
  // Look for the case number in various locations
  const caseNumberSelectors = [
    'span.caseNumber',
    'td:contains("Case Number") + td',
    'th:contains("Case Number") + td',
    'div.caseNumber',
    'h1:contains("Case")',
    'h2:contains("Case")',
    '.case-title'
  ];
  
  // Try jQuery-style selectors first (if page uses jQuery)
  try {
    const caseElement = document.querySelector('td:has-text("Case Number")');
    if (caseElement && caseElement.nextElementSibling) {
      details.caseNumber = caseElement.nextElementSibling.innerText.trim();
    }
  } catch(e) {
    // Fallback to searching all TDs
    const allCells = document.querySelectorAll('td, th');
    for (let i = 0; i < allCells.length; i++) {
      const cell = allCells[i];
      if (cell.innerText.toLowerCase().includes('case number') || 
          cell.innerText.toLowerCase().includes('case no')) {
        const nextCell = allCells[i + 1];
        if (nextCell) {
          details.caseNumber = nextCell.innerText.trim().replace(/\s+/g, '');
          details.extractionQuality += 20;
          log('DEBUG', `Found case number: ${details.caseNumber}`);
          break;
        }
      }
    }
  }
  
  // Fallback: Extract from page text
  if (!details.caseNumber) {
    const caseMatch = document.body.innerText.match(/\b(\d{2}[eE]\d{6}[\s-]*\d{3})\b/);
    if (caseMatch) {
      details.caseNumber = caseMatch[1].replace(/\s+/g, '');
      details.extractionQuality += 10;
      log('DEBUG', `Fallback case number: ${details.caseNumber}`);
    }
  }
  
  // 2. FILING DATE EXTRACTION
  const datePatterns = [
    /Filing\s+Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Date\s+Filed[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /Filed[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i
  ];
  
  for (const pattern of datePatterns) {
    const match = document.body.innerText.match(pattern);
    if (match) {
      details.filingDate = match[1];
      details.extractionQuality += 10;
      log('DEBUG', `Found filing date: ${details.filingDate}`);
      break;
    }
  }
  
  // 3. CASE STATUS
  const statusCells = document.querySelectorAll('td, th');
  for (let i = 0; i < statusCells.length; i++) {
    if (statusCells[i].innerText.toLowerCase().includes('status')) {
      const nextCell = statusCells[i + 1] || statusCells[i].nextElementSibling;
      if (nextCell) {
        details.caseStatus = nextCell.innerText.trim();
        details.extractionQuality += 10;
        log('DEBUG', `Found status: ${details.caseStatus}`);
        break;
      }
    }
  }
  
  // 4. PARTY EXTRACTION - THIS IS CRITICAL
  // NC eCourts typically shows parties in a table with columns:
  // Party Type | Party Name | Address | City | State | Zip | Phone
  
  const partyTables = document.querySelectorAll('table');
  let partyTable = null;
  
  for (const table of partyTables) {
    const headerText = table.innerText.toLowerCase();
    if (headerText.includes('party type') || headerText.includes('party name') ||
        headerText.includes('petitioner') || headerText.includes('respondent')) {
      partyTable = table;
      log('DEBUG', 'Found party table');
      break;
    }
  }
  
  if (partyTable) {
    const rows = partyTable.querySelectorAll('tr');
    
    // Find header row to get column indices
    let headers = [];
    let headerRow = null;
    
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td');
      const rowText = row.innerText.toLowerCase();
      if (rowText.includes('party type') || rowText.includes('party name')) {
        headerRow = row;
        headers = Array.from(cells).map(c => c.innerText.toLowerCase().trim());
        break;
      }
    }
    
    // Get indices for important columns
    const typeIndex = headers.findIndex(h => h.includes('type'));
    const nameIndex = headers.findIndex(h => h.includes('name'));
    const addressIndex = headers.findIndex(h => h.includes('address'));
    const cityIndex = headers.findIndex(h => h.includes('city'));
    const stateIndex = headers.findIndex(h => h.includes('state'));
    const zipIndex = headers.findIndex(h => h.includes('zip'));
    const phoneIndex = headers.findIndex(h => h.includes('phone'));
    
    // Process each party row
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] === headerRow) continue;
      
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < 2) continue;
      
      const partyType = cells[typeIndex]?.innerText.trim().toLowerCase() || '';
      const partyName = cells[nameIndex]?.innerText.trim() || '';
      
      if (!partyName || partyName.toLowerCase().includes('party')) continue;
      
      const partyInfo = {
        name: partyName,
        address: cells[addressIndex]?.innerText.trim() || '',
        city: cells[cityIndex]?.innerText.trim() || '',
        state: cells[stateIndex]?.innerText.trim() || '',
        zip: cells[zipIndex]?.innerText.trim() || '',
        phone: cells[phoneIndex]?.innerText.trim() || ''
      };
      
      // Categorize party
      if (partyType.includes('petitioner') || partyType.includes('plaintiff') ||
          partyType.includes('estate') || partyName.includes('ESTATE OF')) {
        // This is likely the decedent
        details.parties.decedent = partyInfo;
        details.extractionQuality += 15;
        log('DEBUG', `Found decedent: ${partyName} at ${partyInfo.address}`);
      } else if (partyType.includes('executor') || partyType.includes('administrator') ||
                 partyType.includes('personal representative')) {
        // This is the executor
        details.parties.executor = partyInfo;
        details.extractionQuality += 15;
        log('DEBUG', `Found executor: ${partyName} at ${partyInfo.address}`);
      } else if (partyType.includes('heir') || partyType.includes('beneficiary') ||
                 partyType.includes('devisee') || partyType.includes('respondent')) {
        // These are beneficiaries
        details.parties.beneficiaries.push(partyInfo);
        details.extractionQuality += 10;
        log('DEBUG', `Found beneficiary: ${partyName} at ${partyInfo.address}`);
      }
    }
  } else {
    log('WARN', 'No party table found - attempting text extraction');
    
    // Fallback text extraction for decedent name
    const estateMatch = document.body.innerText.match(/(?:ESTATE OF|Estate of)\s+([A-Z][A-Za-z\s,.-]+?)(?:\n|Deceased|DECEASED|$)/);
    if (estateMatch) {
      details.parties.decedent.name = estateMatch[1].trim();
      details.extractionQuality += 5;
      log('DEBUG', `Text extraction found decedent: ${details.parties.decedent.name}`);
    }
  }
  
  // 5. DOCUMENT EXTRACTION - PRIORITIZE OLDEST
  // Look for Register of Actions or Docket table
  let docketTable = null;
  
  for (const table of partyTables) {
    const tableText = table.innerText.toLowerCase();
    if (tableText.includes('register of actions') || tableText.includes('docket') ||
        tableText.includes('filed date') || tableText.includes('document')) {
      docketTable = table;
      log('DEBUG', 'Found docket/document table');
      break;
    }
  }
  
  const documents = [];
  
  if (docketTable) {
    const rows = docketTable.querySelectorAll('tr');
    
    for (const row of rows) {
      // Look for PDF links in this row
      const pdfLink = row.querySelector('a[href*=".pdf"], a[href*="ViewDocument"], a[href*="document"]');
      if (!pdfLink) continue;
      
      // Extract date from row
      const dateMatch = row.innerText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const fileDate = dateMatch ? dateMatch[1] : null;
      
      // Get document name
      const docName = pdfLink.innerText.trim() || pdfLink.title || 'Document';
      
      documents.push({
        url: pdfLink.href,
        name: docName,
        date: fileDate,
        dateObj: fileDate ? new Date(fileDate) : new Date(0),
        row: row.innerText // Keep full row text for context
      });
    }
  } else {
    // Fallback: Find all PDF links on page
    const allPdfLinks = document.querySelectorAll('a[href*=".pdf"], a[href*="document" i]');
    allPdfLinks.forEach((link, index) => {
      documents.push({
        url: link.href,
        name: link.innerText.trim() || `Document_${index + 1}`,
        date: 'Unknown',
        dateObj: new Date(0),
        row: ''
      });
    });
  }
  
  // SORT BY DATE - OLDEST FIRST (these have the contact info!)
  documents.sort((a, b) => a.dateObj - b.dateObj);
  
  // Filter out less useful documents if needed
  const priorityDocs = documents.filter(doc => {
    const name = doc.name.toLowerCase();
    const row = doc.row.toLowerCase();
    
    // Prioritize these document types
    const important = [
      'application', 'petition', 'letters', 'inventory', 
      'final account', 'will', 'death certificate',
      'oath', 'bond', 'acceptance', 'renunciation'
    ];
    
    // Skip these (less likely to have contact info)
    const skip = [
      'notice of hearing', 'order', 'receipt', 'certificate of service',
      'motion', 'affidavit of service', 'alias', 'summons'
    ];
    
    const isImportant = important.some(term => name.includes(term) || row.includes(term));
    const shouldSkip = skip.some(term => name.includes(term) || row.includes(term));
    
    return isImportant || !shouldSkip;
  });
  
  // Use priority docs if we have them, otherwise use all
  details.documents = priorityDocs.length > 0 ? priorityDocs : documents;
  
  if (details.documents.length > 0) {
    details.extractionQuality += 20;
    log('INFO', `Found ${details.documents.length} documents (prioritized for contact info)`);
    
    // Log the first few important docs
    details.documents.slice(0, 3).forEach(doc => {
      log('DEBUG', `Important doc: ${doc.name} (${doc.date})`);
    });
  }
  
  // 6. EXTRACT EVENTS (for context)
  if (docketTable) {
    const rows = docketTable.querySelectorAll('tr');
    details.events = Array.from(rows)
      .filter(row => !row.querySelector('a')) // Rows without links are events
      .map(row => ({
        description: row.innerText.trim(),
        date: row.innerText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || ''
      }))
      .filter(e => e.description && e.description.length > 10);
    
    log('DEBUG', `Extracted ${details.events.length} events`);
  }
  
  // 7. EXTRACT COUNTY (for folder organization)
  const countyMatch = document.body.innerText.match(/County[:\s]+([A-Za-z\s]+?)(?:\n|County)/i);
  if (countyMatch) {
    details.county = countyMatch[1].trim();
    log('DEBUG', `County: ${details.county}`);
  }
  
  // Final quality check
  log('INFO', `Extraction complete - Quality: ${details.extractionQuality}%`, {
    caseNumber: details.caseNumber,
    decedent: details.parties.decedent.name,
    decedentAddress: `${details.parties.decedent.address} ${details.parties.decedent.city}`,
    executor: details.parties.executor.name,
    beneficiaries: details.parties.beneficiaries.length,
    documents: details.documents.length
  });
  
  return details;
}

// Export the function to be used in main script
window.extractCaseDetailsNCeCourts = extractCaseDetailsNCeCourts;