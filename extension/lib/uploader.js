// Uploader utility for sending data to Supabase
export class Uploader {
  constructor() {
    this.endpoint = null;
    this.supabaseUrl = null;
    this.supabaseKey = null;
    this.loadConfig();
  }
  
  async loadConfig() {
    // Try to load from storage
    const config = await chrome.storage.local.get([
      'UPLOAD_ENDPOINT',
      'SUPABASE_URL', 
      'SUPABASE_ANON_KEY'
    ]);
    
    this.endpoint = config.UPLOAD_ENDPOINT || '<span style="color:red">YOUR_PUBLIC_EDGE_FUNCTION_URL</span>';
    this.supabaseUrl = config.SUPABASE_URL || '<span style="color:red">YOUR_SUPABASE_URL</span>';
    this.supabaseKey = config.SUPABASE_ANON_KEY || '<span style="color:red">YOUR_SUPABASE_ANON_KEY</span>';
  }
  
  async uploadCase(caseData) {
    if (!this.endpoint || this.endpoint.includes('YOUR_')) {
      console.error('Upload endpoint not configured');
      return { success: false, error: 'Upload endpoint not configured' };
    }
    
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`
        },
        body: JSON.stringify(caseData)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }
  }
  
  async uploadBatch(cases) {
    const results = [];
    for (const caseData of cases) {
      const result = await this.uploadCase(caseData);
      results.push(result);
    }
    return results;
  }
  
  // Download data as JSON file (fallback when upload not configured)
  downloadAsJson(data, filename = 'cases_export.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, () => {
      URL.revokeObjectURL(url);
    });
  }
}

export default Uploader;
