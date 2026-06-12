exports.handler = async (event) => {
  const { code, error, error_description } = event.queryStringParameters || {};

  if (error) {
    return { statusCode: 302, headers: { Location: `/#debug_error=${encodeURIComponent(error_description || error)}` }, body: '' };
  }
  if (!code) {
    return { statusCode: 302, headers: { Location: '/#debug_error=no_code_received' }, body: '' };
  }

  try {
    const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.WHOOP_CLIENT_ID,
        client_secret: process.env.WHOOP_CLIENT_SECRET,
        redirect_uri: process.env.WHOOP_REDIRECT_URI,
      }).toString(),
    });

    const tokens = await res.json();
    console.log('Token response status:', res.status);
    console.log('Token response:', JSON.stringify(tokens));

    if (!tokens.access_token) {
      return {
        statusCode: 302,
        headers: { Location: `/#debug_fail=${encodeURIComponent(JSON.stringify(tokens))}` },
        body: '',
      };
    }

    const fragment = `whoop_access_token=${encodeURIComponent(tokens.access_token)}&whoop_refresh_token=${encodeURIComponent(tokens.refresh_token || '')}&whoop_expires_in=${tokens.expires_in || 3600}`;
    return {
      statusCode: 302,
      headers: { Location: `/#${fragment}`, 'Cache-Control': 'no-cache' },
      body: '',
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: `/#debug_error=${encodeURIComponent(err.message)}` },
      body: '',
    };
  }
};
