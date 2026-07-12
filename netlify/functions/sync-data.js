const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

exports.handler = async (event) => {
  const code = event.headers['x-sync-code'] || '';
  if (code.length < 8) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Sync code must be at least 8 characters' }) };
  }

  // Derive an unguessable storage key from the user's private sync code
  const key = 'dp_' + crypto.createHash('sha256').update(code).digest('hex').slice(0, 40);

  try {
    const store = getStore({
  name: 'diamond-sync',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_API_TOKEN,
});


    if (event.httpMethod === 'GET') {
      const data = await store.get(key);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: data || JSON.stringify(null),
      };
    }

    if (event.httpMethod === 'POST') {
      await store.set(key, event.body || '{}');
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, savedAt: Date.now() }),
      };
    }

    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
