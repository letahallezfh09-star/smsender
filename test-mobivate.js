const axios = require('axios');

// Test script to check Mobivate API response structure
async function testMobivateAPI() {
  console.log('🧪 Testing Mobivate API Response Structure...\n');
  
  // You'll need to replace this with your actual API key
  const MOBIVATE_API_KEY = 'YOUR_ACTUAL_API_KEY_HERE';
  const MOBIVATE_BASE_URL = 'https://api.mobivatebulksms.com:443';
  
  if (MOBIVATE_API_KEY === 'YOUR_ACTUAL_API_KEY_HERE') {
    console.log('❌ Please replace YOUR_ACTUAL_API_KEY_HERE with your real Mobivate API key');
    console.log('   You can find it in your Mobivate portal under User Profile section');
    return;
  }
  
  const payload = {
    originator: 'TEST',
    recipient: '447930000000', // Test number - replace with a real number for actual test
    body: 'Test message for pricing check - this is a test message to see what data Mobivate returns',
    routeId: 'mglobal'
  };
  
  console.log('📤 Sending test SMS with payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n⏳ Calling Mobivate API...\n');
  
  try {
    const response = await axios.post(`${MOBIVATE_BASE_URL}/send/single`, payload, {
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${MOBIVATE_API_KEY}` 
      },
      timeout: 10000
    });
    
    console.log('✅ Mobivate API Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check for pricing fields
    const pricingFields = ['cost', 'price', 'amount', 'charge', 'fee', 'rate', 'costUSD', 'priceUSD'];
    console.log('\n💰 Checking for pricing fields:');
    let foundPricing = false;
    pricingFields.forEach(field => {
      if (response.data[field] !== undefined) {
        console.log(`  ✅ ${field}: ${response.data[field]}`);
        foundPricing = true;
      }
    });
    
    if (!foundPricing) {
      console.log('  ❌ No pricing fields found in response');
      console.log('  📋 Available fields:', Object.keys(response.data));
    }
    
    // Check for other useful fields
    console.log('\n📋 All response fields:');
    Object.keys(response.data).forEach(key => {
      console.log(`  ${key}: ${response.data[key]}`);
    });
    
  } catch (error) {
    console.log('❌ Error calling Mobivate API:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('Error:', error.message);
    }
  }
}

testMobivateAPI();
