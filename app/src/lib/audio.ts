// Split out of App.jsx in Phase 2. Behaviour unchanged.

export let _audioCtx: AudioContext | null = null;

export function getAudioCtx(): AudioContext | null {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch(e) { return null; }
}

// Call on a user gesture (e.g. starting a set) to unlock audio on iOS.
export function primeAudio() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const o=ctx.createOscillator(), g=ctx.createGain();
    g.gain.value=0; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime+0.01);
  } catch(e) {}
}

export function vibrate(pattern: number | number[]) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
}

export function playChime() {
  // NOTE ON iOS: Web Audio obeys the physical mute switch, and navigator.vibrate is not
  // supported in Safari at all. With the ringer off, neither sound nor haptic can fire —
  // no web app can override that. Hence the louder, longer, repeated pattern below plus a
  // full-screen visual flash, so the end of a rest period is unmissable when audio does work
  // and still obvious when it does not.
  vibrate([200, 100, 200, 100, 400]);
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    // Three rising triplets over ~1.6s, at roughly double the previous gain.
    const seq = [[880,0],[1100,.15],[1320,.3],
                 [880,.6],[1100,.75],[1320,.9],
                 [880,1.2],[1100,1.35],[1320,1.5]];
    seq.forEach(([freq,delay]) => {
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value=freq; o.type='sine';
      g.gain.setValueAtTime(0, ctx.currentTime+delay);
      g.gain.linearRampToValueAtTime(.34, ctx.currentTime+delay+.04);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+delay+.45);
      o.start(ctx.currentTime+delay); o.stop(ctx.currentTime+delay+.5);
    });
  } catch(e) {}
}
