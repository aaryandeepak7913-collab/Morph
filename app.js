const $=s=>document.querySelector(s);
// id, label, ext, mime, usesQuality, needsText
const FM=[['pdf','Compressed PDF','pdf','application/pdf',1],['cbz','CBZ comic','cbz','application/vnd.comicbook+zip',1],
['epubi','EPUB','epub','application/epub+zip',1],['epubt','EPUB','epub','application/epub+zip',0,1],
['jpg','JPG pages','zip','application/zip',1],['png','PNG pages','zip','application/zip',0],
['webp','WebP pages','zip','application/zip',1],['txt','Plain text','txt','text/plain',0,1]];
const SUB={pdf:'smaller file',cbz:'page images',epubi:'page images',epubt:'selectable text',jpg:'zipped',png:'zipped, lossless',webp:'zipped',txt:'text only'};
let src,pdfjs,fmt='pdf',url;
const kb=n=>n>1e6?(n/1e6).toFixed(1)+' MB':Math.max(1,Math.round(n/1e3))+' KB';
const msg=t=>$('#msg').textContent=t||'';
const toBlob=(c,t,q)=>new Promise(r=>c.toBlob(r,t,q));
const pad=(i,n)=>String(i).padStart(String(n).length,'0');
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

function drawFormats(){
  $('#fmts').innerHTML='';
  FM.forEach(f=>{const b=document.createElement('button');b.setAttribute('role','radio');
    b.innerHTML=`${f[1]}<small>${SUB[f[0]]}</small>`;b.disabled=!!f[5]&&!src.pdf;
    b.onclick=()=>pick(f[0]);b.dataset.id=f[0];$('#fmts').append(b)});
  pick(src.pdf||fmt==='pdf'||!FM.find(f=>f[0]===fmt)[5]?fmt:'pdf');
}
function pick(id){fmt=id;const f=FM.find(x=>x[0]===id);
  document.querySelectorAll('#fmts button').forEach(b=>b.setAttribute('aria-checked',b.dataset.id===id));
  $('#oq').hidden=!f[4];$('#od').hidden=!!f[5];$('#res').innerHTML=''}
$('#q').oninput=e=>$('#qo').textContent=e.target.value;

async function load(files){
  msg();files=[...files];if(!files.length)return;const f=files[0],n=f.name.toLowerCase();
  const total=files.reduce((a,x)=>a+x.size,0);
  try{
    if(n.endsWith('.pdf')){
      pdfjs=pdfjs||await import('./lib/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./lib/pdf.worker.min.mjs';
      const d=await pdfjs.getDocument({data:await f.arrayBuffer(),cMapUrl:'./lib/cmaps/',cMapPacked:true,standardFontDataUrl:'./lib/standard_fonts/'}).promise;
      src={pdf:d,name:f.name,n:d.numPages,size:total,
        async dim(i){const v=(await d.getPage(i)).getViewport({scale:1});return[v.width,v.height]},
        async canvas(i,s){const p=await d.getPage(i),v=p.getViewport({scale:s}),c=document.createElement('canvas');
          c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
          await p.render({canvasContext:x,viewport:v}).promise;return c}};
    }else{
      let imgs;
      if(n.endsWith('.cbz')||n.endsWith('.zip')){
        const z=await JSZip.loadAsync(f);
        imgs=await Promise.all(Object.values(z.files).filter(x=>!x.dir&&/\.(jpe?g|png|webp|gif|bmp)$/i.test(x.name)&&!x.name.includes('__MACOSX'))
          .sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).map(x=>x.async('blob')));
      }else imgs=files.filter(x=>x.type.startsWith('image/')).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
      if(!imgs.length)return msg('No supported pages found. Use a PDF, CBZ, ZIP of images, or image files.');
      const bm=await Promise.all(imgs.map(b=>createImageBitmap(b)));
      src={name:f.name,n:bm.length,size:total,
        async dim(i){return[bm[i-1].width*.75,bm[i-1].height*.75]},
        async canvas(i,s){s=Math.min(s,4/3);const b=bm[i-1],c=document.createElement('canvas');
          c.width=Math.round(b.width*.75*s);c.height=Math.round(b.height*.75*s);const x=c.getContext('2d');
          x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(b,0,0,c.width,c.height);return c}};
    }
  }catch(e){return msg('Could not open that file. It may be damaged or password-protected.')}
  $('#info').innerHTML=`<b>${esc(src.name)}</b><br>${src.n} page${src.n>1?'s':''} · ${kb(src.size)}`;
  $('#panel').hidden=false;$('#res').innerHTML='';drawFormats();
}
$('#file').onchange=e=>load(e.target.files);
const dz=$('#drop');
['dragenter','dragover'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.add('on')}));
['dragleave','drop'].forEach(t=>dz.addEventListener(t,e=>{e.preventDefault();dz.classList.remove('on')}));
dz.addEventListener('drop',e=>load(e.dataTransfer.files));

async function pageText(i){
  const t=await(await src.pdf.getPage(i)).getTextContent();let ps=[],cur='',y=null,h=10;
  for(const it of t.items){const yy=it.transform[5];
    if(y!==null&&Math.abs(yy-y)>2){if(Math.abs(yy-y)>h*1.7){ps.push(cur);cur=''}else cur+=' '}
    cur+=it.str;y=yy;h=it.height||h}
  ps.push(cur);return ps.map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean)}

async function epub(title,bodies,imgs){
  const z=new JSZip(),X='<?xml version="1.0" encoding="UTF-8"?>';let man='',spine='',nav='';
  z.file('mimetype','application/epub+zip',{compression:'STORE'});
  z.file('META-INF/container.xml',X+'<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  bodies.forEach((b,i)=>{const n=i+1;
    z.file(`OEBPS/p${n}.xhtml`,X+`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${n}</title><style>img{max-width:100%;height:auto}</style></head><body>${b}</body></html>`);
    man+=`<item id="p${n}" href="p${n}.xhtml" media-type="application/xhtml+xml"/>`;spine+=`<itemref idref="p${n}"/>`;nav+=`<li><a href="p${n}.xhtml">Page ${n}</a></li>`;
    if(imgs){z.file(`OEBPS/i${n}.jpg`,imgs[i]);man+=`<item id="i${n}" href="i${n}.jpg" media-type="image/jpeg"/>`}});
  z.file('OEBPS/nav.xhtml',X+`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${nav}</ol></nav></body></html>`);
  z.file('OEBPS/content.opf',X+`<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().slice(0,19)}Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${man}</manifest><spine>${spine}</spine></package>`);
  return z.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
}

$('#go').onclick=async()=>{
  const f=FM.find(x=>x[0]===fmt),q=+$('#q').value/100,s=+$('#dpi').value/72,N=src.n;
  const go=$('#go');go.disabled=true;$('#prog').hidden=false;$('#res').innerHTML='';msg();
  const prog=i=>$('#bar').style.width=(i/N*100)+'%';let blob;
  try{
    if(f[5]){
      const pgs=[];for(let i=1;i<=N;i++){pgs.push(await pageText(i));prog(i)}
      if(!pgs.some(p=>p.length))throw new Error('No selectable text found. This looks scanned, so use an image format instead.');
      blob=fmt==='txt'?new Blob([pgs.map(p=>p.join('\n\n')).join('\n\n\f\n\n')],{type:f[3]})
        :await epub(src.name.replace(/\.\w+$/,''),pgs.map(p=>p.map(t=>`<p>${esc(t)}</p>`).join('')),null);
    }else{
      const type=fmt==='png'?'image/png':fmt==='webp'?'image/webp':'image/jpeg',ext=fmt==='png'?'png':fmt==='webp'?'webp':'jpg';
      const imgs=[],dims=[];
      for(let i=1;i<=N;i++){const c=await src.canvas(i,s);dims.push(await src.dim(i));imgs.push(await toBlob(c,type,q));c.width=0;prog(i)}
      if(fmt==='pdf'){
        const d=await PDFLib.PDFDocument.create();
        for(let i=0;i<N;i++){const im=await d.embedJpg(await imgs[i].arrayBuffer()),p=d.addPage(dims[i]);p.drawImage(im,{x:0,y:0,width:dims[i][0],height:dims[i][1]})}
        blob=new Blob([await d.save()],{type:f[3]});
      }else if(fmt==='epubi'){
        blob=await epub(src.name.replace(/\.\w+$/,''),imgs.map((_,i)=>`<div style="text-align:center"><img src="i${i+1}.jpg" alt="Page ${i+1}"/></div>`),imgs);
      }else{
        const z=new JSZip();imgs.forEach((b,i)=>z.file(`${pad(i+1,N)}.${ext}`,b));
        blob=await z.generateAsync({type:'blob',compression:'STORE',mimeType:f[3]});
      }
    }
    url&&URL.revokeObjectURL(url);url=URL.createObjectURL(blob);
    const name=src.name.replace(/\.\w+$/,'')+(fmt==='pdf'?'-compressed':'')+'.'+f[2],d=Math.round((1-blob.size/src.size)*100);
    $('#res').innerHTML=`<p>${kb(src.size)} → ${kb(blob.size)}${fmt==='pdf'?(d>0?` · ${d}% smaller`:' · larger, try lower quality or dpi'):''}</p><a href="${url}" download="${esc(name)}">Download ${esc(name)}</a>`;
  }catch(e){msg(e.message||'Conversion failed.')}
  go.disabled=false;$('#prog').hidden=true;$('#bar').style.width=0;
};
