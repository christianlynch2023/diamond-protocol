function readCookie(header, name) {
  const raw = header || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

exports.handler = async (event) => {
  const { code, error, error_description, state } = event.queryStringParameters || {};
  // Expire the state cookie on every exit path so it can never be replayed.
  const clearState = 'whoop_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

  if (error) {
    return { statusCode: 302, headers: { Location: `/#debug_error=${encodeURIComponent(error_description || error)}`, 'Set-Cookie': clearState }, body: '' };
  }
  if (!code) {
    return { statusCode: 302, headers: { Location: '/#debug_error=no_code_received', 'Set-Cookie': clearState }, body: '' };
  }

  // CSRF check. whoop-auth.js issues a random state and stores it in an httpOnly cookie;
  // this compares the two. Previously the state was generated and then never looked at, so
  // an attacker could feed their own authorisation code into this endpoint and bind their
  // WHOOP account to the session. Skipped only when no cookie exists, so a login started
  // before this change was deployed still completes rather than hard-failing.
  const expected = readCookie(event.headers.cookie || event.headers.Cookie, 'whoop_state');
  if (expected && state !== expected) {
    return { statusCode: 302, headers: { Location: '/#debug_error=state_mismatch', 'Set-Cookie': clearState }, body: '' };
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
    // Log the status only. The previous version wrote the FULL token payload to the Netlify
    // function logs, so live access and refresh tokens were persisted in plain text in log
    // storage — anyone with log access could read the WHOOP account indefinitely.
    console.log('WHOOP token exchange status:', res.status, 'ok:', !!tokens.access_token);

    if (!tokens.access_token) {
      // Report only the error code, never the response body, which can echo credentials.
      const reason = tokens.error || 'no_access_token';
      return {
        statusCode: 302,
        headers: { Location: `/#debug_fail=${encodeURIComponent(reason)}`, 'Set-Cookie': clearState },
        body: '',
      };
    }

    const fragment = `whoop_access_token=${encodeURIComponent(tokens.access_token)}&whoop_refresh_token=${encodeURIComponent(tokens.refresh_token || '')}&whoop_expires_in=${tokens.expires_in || 3600}`;
    return {
      statusCode: 302,
      headers: { Location: `/#${fragment}`, 'Cache-Control': 'no-cache', 'Set-Cookie': clearState },
      body: '',
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: `/#debug_error=${encodeURIComponent(err.message)}`, 'Set-Cookie': clearState },
      body: '',
    };
  }
};
