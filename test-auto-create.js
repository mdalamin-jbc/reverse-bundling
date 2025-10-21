import fetch from 'node-fetch';

async function testAutoCreate() {
  const formData = new FormData();

  // Simulate form data for creating a bundle rule with auto-create
  formData.append('action', 'createRule');
  formData.append('name', 'Test Bundle');
  formData.append('items', 'gid://shopify/ProductVariant/7712318390316,gid://shopify/ProductVariant/7712318357548'); // Using variant IDs from the products I saw
  formData.append('bundledSku', ''); // Empty since auto-create is enabled
  formData.append('savings', '10');
  formData.append('autoCreateProduct', 'true');

  try {
    const response = await fetch('http://localhost:49531/app/bundle-rules', {
      method: 'POST',
      body: formData,
      headers: {
        // Add any necessary headers for authentication/session
        'Cookie': '', // We'll need to get the session cookie
      }
    });

    const result = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testAutoCreate();