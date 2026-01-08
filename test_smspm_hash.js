// Quick test to see what SMSPM returns with different hash formats
const axios = require('axios');

async function testHash() {
  const hashes = ['SSMSSEND', 'SSMSSEND'.toLowerCase()];
  
  for (const hash of hashes) {
    console.log(`\nTesting hash: ${hash}`);
    try {
      const r = await axios.post('https://api.smspm.com', {
        hash: hash,
        toNumber: '972546934003',
        text: 'Hash test',
        fromNumber: 'SMSPM.com',
        token: '9CI3JLSK-I35E-M7Q3-ZCLV-3J1WV68MHR66'
      });
      console.log('Response:', JSON.stringify(r.data, null, 2));
    } catch (e) {
      console.log('Error:', e.response?.data || e.message);
    }
  }
}

testHash();
