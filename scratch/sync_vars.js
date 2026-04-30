const { execSync } = require('child_process');

const targetService = 'wpautopublish-worker';

console.log('Fetching source variables...');
const raw = execSync('railway variables list --json').toString();
const vars = JSON.parse(raw);

const filteredVars = Object.entries(vars)
  .filter(([key]) => !key.startsWith('RAILWAY_') && key !== 'PORT')
  .map(([key, val]) => `${key}="${val.replace(/"/g, '\\"')}"`)
  .join(' ');

console.log(`Setting variables for ${targetService}...`);
// We must be linked to the project for this to work
execSync(`railway variables set --service ${targetService} ${filteredVars}`, { stdio: 'inherit' });

console.log('Variables synced!');
