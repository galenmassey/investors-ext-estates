const http = require('http');
const fs = require('fs');
const path = require('path');

let reloadTime = Date.now();

// Watch for file changes
fs.watch('.', { recursive: true }, (eventType, filename) => {
  if (filename && !filename.includes('node_modules') && !filename.includes('.git')) {
    console.log(`[${new Date().toLocaleTimeString()}] File changed: ${filename}`);
    reloadTime = Date.now();
  }
});

// Simple server for reload checks
http.createServer((req, res) => {
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify({ time: reloadTime }));
}).listen(8888);

console.log('=====================================');
console.log('Dev Reload Server Started!');
console.log('=====================================');
console.log('Port: http://localhost:8888');
console.log('Extension will auto-reload on file changes');
console.log('');
console.log('Make sure to:');
console.log('1. Load the extension in Chrome');
console.log('2. Keep this terminal window open');
console.log('3. Save files to trigger reload');
console.log('=====================================');
console.log('');
console.log('Watching for changes...');
