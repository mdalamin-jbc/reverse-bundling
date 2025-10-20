import fetch from 'node-fetch';

async function testAnalyzeOrders() {
  try {
    // Make a POST request to the analyzeOrders action
    const response = await fetch('http://localhost:59641/app/bundle-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'analyzeOrders'
      })
    });

    const result = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', result);

  } catch (error) {
    console.error('Test error:', error);
  }
}

testAnalyzeOrders();