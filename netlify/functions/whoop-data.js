const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No token' }) };

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  try {
    const [cycleRes, sleepRes, recRes] = await Promise.all([
      fetch('https://api.prod.whoop.com/developer/v2/cycle?limit=1', auth),
      fetch('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1', auth),
      fetch('https://api.prod.whoop.com/developer/v2/recovery?limit=25', auth),
    ]);

    if (cycleRes.status === 401 || sleepRes.status === 401) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token expired' }) };
    }

    const [cycles, sleep] = await Promise.all([cycleRes.json(), sleepRes.json()]);
    let recovery = null;
    try { if (recRes.ok) recovery = await recRes.json(); } catch (e) { recovery = null; }

    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ cycles, sleep, recovery }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
