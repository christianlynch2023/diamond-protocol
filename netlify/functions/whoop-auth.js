const crypto = require('crypto');

exports.handler = async () => {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  // Math.random() is not cryptographically secure and is predictable enough that a state
  // built from it offers no real CSRF protection. randomBytes is the correct source.
  //
  // NOTE: this value is still not VERIFIED on return — whoop-callback.js would need to
  // compare it against the cookie set below. Until that change is made, this is a
  // correctness improvement to the token itself, not full CSRF protection.
  const state = crypto.randomBytes(24).toString('hex');

  const scope = 'read:recovery read:cycles read:sleep read:workout read:body_measurement offline';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`,
      'Cache-Control': 'no-cache',
      // Short-lived, httpOnly so page scripts cannot read it. Harmless if the callback
      // ignores it; becomes real protection once the callback compares the two.
      'Set-Cookie': `whoop_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
    body: '',
  };
};
