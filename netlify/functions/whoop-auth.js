exports.handler = async () => {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  console.log('CLIENT_ID set:', !!clientId);
  console.log('REDIRECT_URI:', redirectUri);

  const scope = 'read:recovery read:cycles read:sleep read:workout read:body_measurement offline';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
  });

  const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`;
  console.log('Auth URL:', authUrl);

  return {
    statusCode: 302,
    headers: { Location: authUrl, 'Cache-Control': 'no-cache' },
    body: '',
  };
};
