const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '');
  if (!token) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No token' }) };

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  try {
    // Depth matches the app's analysis windows. Most analytics use a 21-day window, so 14
    // records fall short of a full window and 1 sleep record makes sleep trends impossible.
    // Sleep and recovery pair 1:1, so they are kept at the same depth to avoid days that
    // have a recovery score with no matching sleep.
    const [cycleRes, sleepRes, recRes, workoutRes] = await Promise.all([
      fetch('https://api.prod.whoop.com/developer/v2/cycle?limit=25', auth),
      fetch('https://api.prod.whoop.com/developer/v2/activity/sleep?limit=25', auth),
      fetch('https://api.prod.whoop.com/developer/v2/recovery?limit=25', auth),
      fetch('https://api.prod.whoop.com/developer/v2/activity/workout?limit=25', auth),
    ]);

    // An expired token on ANY endpoint means the same thing. Previously only cycle and sleep
    // were checked, so a 401 on recovery returned HTTP 200 with recovery:null and the app
    // silently showed no recovery score, skin temp or SpO2 with no error to explain it.
    if (cycleRes.status === 401 || sleepRes.status === 401 ||
        recRes.status === 401 || workoutRes.status === 401) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token expired' }) };
    }

    const [cycles, sleep] = await Promise.all([cycleRes.json(), sleepRes.json()]);

    // Non-401 failures still degrade gracefully, but are now REPORTED rather than hidden.
    // The client can surface "recovery unavailable" instead of appearing to have no data.
    const errors = {};
    let recovery = null, workouts = null;
    try {
      if (recRes.ok) recovery = await recRes.json();
      else errors.recovery = 'HTTP ' + recRes.status;
    } catch (e) { errors.recovery = e.message || 'parse failed'; }
    try {
      if (workoutRes.ok) workouts = await workoutRes.json();
      else errors.workouts = 'HTTP ' + workoutRes.status;
    } catch (e) { errors.workouts = e.message || 'parse failed'; }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycles, sleep, recovery, workouts,
        ...(Object.keys(errors).length ? { errors } : {}),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
