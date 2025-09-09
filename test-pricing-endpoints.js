const axios = require('axios');

// Test script to check Mobivate pricing endpoints
async function testPricingEndpoints() {
  console.log('🧪 Testing Mobivate Pricing Endpoints...\n');
  
  const MOBIVATE_API_KEY = 'YOUR_ACTUAL_API_KEY_HERE';
  const MOBIVATE_BASE_URL = 'https://api.mobivatebulksms.com:443';
  
  if (MOBIVATE_API_KEY === 'YOUR_ACTUAL_API_KEY_HERE') {
    console.log('❌ Please replace YOUR_ACTUAL_API_KEY_HERE with your real Mobivate API key');
    return;
  }
  
  const endpoints = [
    '/apis/sms/mt/v2/pricing',
    '/apis/sms/mt/v2/balance', 
    '/balance',
    '/pricing',
    '/account/balance',
    '/account/pricing',
    '/sms/pricing',
    '/sms/balance'
  ];
  
  console.log('🔍 Testing various pricing/balance endpoints...\n');
  
  for (const endpoint of endpoints) {
    try {
      console.log(`📡 Testing: ${endpoint}`);
      
      const response = await axios.get(`${MOBIVATE_BASE_URL}${endpoint}`, {
        headers: { 
          'Authorization': `Bearer ${MOBIVATE_API_KEY}` 
        },
        timeout: 5000
      });
      
      console.log(`✅ ${endpoint} - Status: ${response.status}`);
      console.log('Response:', JSON.stringify(response.data, null, 2));
      console.log('---\n');
      
    } catch (error) {
      if (error.response) {
        console.log(`❌ ${endpoint} - Status: ${error.response.status}`);
        console.log('Error:', error.response.data);
      } else {
        console.log(`❌ ${endpoint} - Error: ${error.message}`);
      }
      console.log('---\n');
    }
  }
}

testPricingEndpoints();
