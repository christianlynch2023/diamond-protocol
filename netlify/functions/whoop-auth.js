exports.handler = async () => {
  const scope = 'read:recovery read:cycles read:sleep read:workout read:body_measurement offline';
  const params = new URLSearchParams({
    client_id: process.env.WHOOP_CLIENT_ID,
    redirect_uri: process.env.WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope,
  });
  return {
    statusCode: 302,
    headers: { Location: `https://api.prod.whoop.com/oauth/oauth2/auth?${params}`, 'Cache-Control': 'no-cache' },
    body: '',
  };
};
