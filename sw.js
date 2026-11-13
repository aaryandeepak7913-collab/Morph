const C='morph-v1',A=['./','index.html','style.css','app.js','manifest.json','icon.svg','icon-192.png','icon-512.png','lib/pdf.min.mjs','lib/pdf.worker.min.mjs','lib/jszip.min.js','lib/pdf-lib.min.js'];
addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>skipWaiting())));
addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>clients.claim())));
addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok&&new URL(e.request.url).origin===location.origin){const c=n.clone();caches.open(C).then(x=>x.put(e.request,c))}return n})))});
