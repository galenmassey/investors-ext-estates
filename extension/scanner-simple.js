// Simple scanner that looks for estate cases by their distinctive pattern
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