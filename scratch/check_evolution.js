const https = require('https');

const options = {
  hostname: 'evolution-api-production-8aee.up.railway.app',
  path: '/instance/fetchInstances',
  method: 'GET',
  headers: {
    'apikey': '10437aabcfd450c11023f8a72975ffd0'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
