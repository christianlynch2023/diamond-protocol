/* global __BUILD_ID__ */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    const rd=Array.isArray(r)?r:[r,r,r,r];
    this.beginPath();
    this.moveTo(x+rd[0],y); this.lineTo(x+w-rd[1],y);
    this.arcTo(x+w,y,x+w,y+rd[1],rd[1]); this.lineTo(x+w,y+h-rd[2]);
    this.arcTo(x+w,y+h,x+w-rd[2],y+h,rd[2]); this.lineTo(x+rd[3],y+h);
    this.arcTo(x,y+h,x,y+h-rd[3],rd[3]); this.lineTo(x,y+rd[0]);
    this.arcTo(x,y,x+rd[0],y,rd[0]); this.closePath(); return this;
  };
}
const ic=document.createElement('canvas'); ic.width=ic.height=512;
const cx=ic.getContext('2d');
cx.fillStyle='#0a0c10'; cx.roundRect(0,0,512,512,80); cx.fill();
cx.fillStyle='#c4ff00'; cx.roundRect(0,0,512,10,[80,80,0,0]); cx.fill();
cx.fillStyle='#c4ff00'; cx.font='bold 300px system-ui,sans-serif';
cx.textAlign='center'; cx.textBaseline='middle'; cx.fillText('\u26a1',256,265);
const iurl=ic.toDataURL('image/png');
document.getElementById('apple-icon').href=iurl;
const mf={name:"Diamond Protocol",short_name:"Diamond",description:"12-Week Hypertrophy Tracker",start_url:".",display:"standalone",background_color:"#0a0c10",theme_color:"#0a0c10",orientation:"portrait-primary",icons:[{src:iurl,sizes:"512x512",type:"image/png"},{src:iurl,sizes:"192x192",type:"image/png"}]};
const mb=new Blob([JSON.stringify(mf)],{type:'application/json'});
const ml=document.createElement('link'); ml.rel='manifest'; ml.href=URL.createObjectURL(mb); document.head.appendChild(ml);
// HARD CACHE-BUST: if the stored build id differs from this bundle's, delete every cache and
// unregister the old service worker, then reload once. This is the only reliable way to escape
// a wedged PWA cache on iOS, where a stale bundle can otherwise persist across reopens.
(function(){
  // Single source of truth for the build stamp. Bump this ONE value on every ship; the Tools
  // screen reads it via window.DP_BUILD so the displayed build can never drift from the SW-bust
  // value again. (No deploy-time injection in a static single file, so this stays manual.)
  // Stamped automatically at build time by vite.config.js, so it can no longer drift.
  var BUILD=__BUILD_ID__;
  try { window.DP_BUILD = BUILD; } catch(e) {}
  try {
    var prev = localStorage.getItem('dp_build');
    if (prev !== BUILD) {
      localStorage.setItem('dp_build', BUILD);
      if (prev !== null && 'caches' in window) {
        caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
          .then(function(){
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
              return navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.map(function(r){ return r.unregister(); })); });
            }
          })
          .then(function(){ if(!sessionStorage.getItem('dp_busted')){ sessionStorage.setItem('dp_busted','1'); location.reload(true); } })
          .catch(function(){});
      }
    }
  } catch(e) {}
})();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Force an update check on every load. Without this the PWA could keep serving a
      // cached bundle indefinitely, producing the confusing state where some values reflect
      // new code and others come from stale cached JS.
      reg.update().catch(()=>{});
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // A new build is ready and an old one is controlling the page: activate it now.
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            try { nw.postMessage({ type: 'SKIP_WAITING' }); } catch(e) {}
            if (!window.__dpReloaded) { window.__dpReloaded = true; window.location.reload(); }
          }
        });
      });
    }).catch(()=>{});
    // Also re-check whenever the app is brought back to the foreground (iOS PWAs are
    // suspended rather than closed, so 'load' may not fire for days).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(r => r && r.update().catch(()=>{})).catch(()=>{});
      }
    });
  });
}
