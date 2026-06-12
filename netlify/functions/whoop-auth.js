exports.handler = async () => {
 const clientId = process.env.WHOOP_CLIENT_ID;
 const redirectUri = process.env.WHOOP_REDIRECT_URI;

 const state = Math.random().toString(36).substring(2, 18) +
               Math.random().toString(36).substring(2, 18);

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
   },
   body: '',
 };
};
