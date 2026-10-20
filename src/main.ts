import { createBrowserQrCore, encodePayload, validateDocument } from '@pfxamd/qr-core';
import type { QrDocument, QrRenderFormat } from '@pfxamd/qr-core';
import './style.css';
import './identity.css';

type Kind = 'url' | 'text' | 'email' | 'phone' | 'sms' | 'wifi';
type Form = { kind: Kind; value: string; ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean; subject: string; body: string; message: string; size: number; margin: number; foreground: string; background: string; correction: 'L'|'M'|'Q'|'H'; dotStyle: QrDocument['dotStyle']; logo?: string; };
const initial: Form = {kind:'url',value:'https://example.com',ssid:'',password:'',security:'WPA',hidden:false,subject:'',body:'',message:'',size:640,margin:24,foreground:'#111827',background:'#ffffff',correction:'H',dotStyle:'square'};
const saved = localStorage.getItem('pfx-qr-studio-preferences');
let state: Form = {...initial};
if (saved) { try {const json: unknown=JSON.parse(saved); if(json && typeof json==='object'){const o=json as Partial<Form>;state={...initial,...o,logo:undefined};}} catch {/* ignore invalid storage */} }
let lastValid: {blob: Blob; payload: string} | null = null;
let lastDecoded = '';
let scanTicket = 0;
let pending = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<header class="topbar">
  <a class="brand" href="./" aria-label="PFx QR Studio home"><img class="brand-logo" src="/pfx-qr-studio/pfx-logo.svg" alt="" width="45" height="40"/><span class="brand-title">PFx QR Studio</span><span class="alpha-badge">Alpha 0.1</span></a>
  <div class="topbar-right"><span class="top-note"><span class="privacy-dot"></span>Built for your browser. No uploads.</span><button id="theme" class="ghost theme-button" type="button" aria-label="Toggle color theme">Dark mode</button></div>
</header>
<main class="workspace">
  <section class="editor" aria-label="QR settings">
    <div class="section-heading"><div class="eyebrow">PFx / CREATIVE TOOLS / QR STUDIO</div><h1>Every code.<br/><span>Your signature.</span></h1><p>Make a QR code that looks right, works reliably and stays yours.</p></div>
    <div class="panel"><div class="panel-heading"><span class="step-no">01</span><div><h2>Content</h2><p>Choose what your code opens.</p></div></div>
      <label for="kind">Content type</label><select id="kind"><option value="url">Website / YouTube link</option><option value="text">Plain text</option><option value="email">Email</option><option value="phone">Phone call</option><option value="sms">SMS message</option><option value="wifi">Wi-Fi network</option></select>
      <div id="content-fields"></div>
    </div>
    <div class="panel"><div class="panel-heading"><span class="step-no">02</span><div><h2>Appearance</h2><p>Customize the code to suit your brand.</p></div></div>
      <label>Quick palettes</label><div class="preset-row"><button type="button" class="preset" data-foreground="#111827" data-background="#ffffff"><span style="background:#111827"></span>Classic</button><button type="button" class="preset" data-foreground="#c62036" data-background="#ffffff"><span style="background:#c62036"></span>Red</button><button type="button" class="preset" data-foreground="#14532d" data-background="#ffffff"><span style="background:#14532d"></span>Forest</button><button type="button" class="preset" data-foreground="#f8fafc" data-background="#172033"><span style="background:#172033"></span>Inverse</button></div>
      <div class="two-cols"><div><label for="foreground">QR color</label><input id="foreground" type="color"/></div><div><label for="background">Background</label><input id="background" type="color"/></div></div>
      <label for="dotStyle">Module style</label><select id="dotStyle"><option value="square">Square</option><option value="rounded">Rounded</option><option value="dots">Dots</option><option value="classy">Classy</option><option value="classy-rounded">Classy rounded</option><option value="extra-rounded">Extra rounded</option></select>
      <label for="correction">Error correction</label><select id="correction"><option value="L">Low (more capacity)</option><option value="M">Medium</option><option value="Q">Quartile</option><option value="H">High (recommended with logo)</option></select>
    </div>
    <div class="panel"><div class="panel-heading"><span class="step-no">03</span><div><h2>Quality & export</h2><p>Control output size and scan safety.</p></div></div>
      <label for="size">Resolution <output id="size-output">640 px</output></label><input id="size" type="range" min="128" max="4096" step="64"/>
      <label for="margin">Quiet zone <output id="margin-output">24 px</output></label><input id="margin" type="range" min="0" max="128" step="8"/><p class="field-hint">Leave some space around the code to help cameras read it.</p>
      <label for="logo">Center logo (optional)</label><input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"/><button class="ghost small" id="remove-logo" type="button">Remove logo</button>
    </div>
    <button type="button" id="reset" class="text-button">Reset all settings</button>
  </section>
  <aside class="preview-side" aria-label="QR preview and tools">
    <div class="preview-card">
      <div class="preview-top"><div><span class="eyebrow">LIVE PREVIEW</span><h2>Ready to share.</h2></div><span id="status" class="status-pill" role="status" aria-live="polite">Initializing…</span></div>
      <div class="preview-stage"><div class="qr-mat"><img id="qr-preview" alt="Generated QR code preview" width="320" height="320"/></div></div>
      <div id="feedback" role="alert" class="feedback" hidden></div>
      <div id="verified-state" class="verified-state" role="status" aria-live="polite"></div>
      <div class="output-actions"><label for="format">DOWNLOAD FORMAT</label><div class="download-row"><select id="format" aria-label="Download format"><option value="png">PNG</option><option value="svg">SVG</option><option value="webp">WebP</option></select><button id="download" class="primary" type="button" disabled>Download QR</button></div>
      <div class="utility-row"><button id="verify" class="ghost" type="button" disabled>Test scan</button><button id="copy-image" class="ghost" type="button" disabled>Copy PNG</button><button id="copy-content" class="ghost" type="button">Copy content</button></div>
      <p><span class="privacy-dot"></span>Everything is generated locally on your device.</p></div>
    </div>
    <div class="scan-box"><div class="scan-head"><div><span class="eyebrow">QR READER</span><h2>Have a QR already?</h2><p>Decode a QR image on your device. Nothing is uploaded.</p></div></div>
      <label class="scan-file" for="scan-file"><span>Choose an image to scan</span><small>PNG, JPEG or WebP — up to 10 MB</small></label><input id="scan-file" type="file" accept="image/png,image/jpeg,image/webp"/>
      <div id="scan-status" class="scan-status" role="status" aria-live="polite"></div>
      <div id="scan-result-wrap" hidden><label for="scan-result">Decoded content</label><textarea id="scan-result" rows="3" readonly></textarea><button id="copy-scan" class="ghost small" type="button">Copy decoded content</button></div>
    </div>
  </aside>
</main>
<footer><span>© PFx QR Studio</span><span>Powered by <a href="https://github.com/pfxamd/pfx-qr-core" target="_blank" rel="noopener noreferrer">PFx QR Core</a></span></footer>`;
const $ = <T extends HTMLElement>(selector:string) => document.querySelector<T>(selector)!;
const el = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const preview=el<HTMLImageElement>('qr-preview');
let objectUrl: string | null=null;
const valuesByKind: Partial<Record<Kind,string>> = {[state.kind]:state.value};
const corePromise=createBrowserQrCore();
function displayFields() {
  const container=el<HTMLDivElement>('content-fields');
  if (state.kind==='wifi') {
    container.innerHTML='<label for="ssid">Network name (SSID)</label><input id="ssid" type="text" placeholder="Your Wi-Fi name"/><label for="security">Security</label><select id="security"><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Open network (no password)</option></select><div id="wifi-password-wrap"><label for="password">Password</label><input id="password" type="text" autocomplete="off"/></div><label class="checkbox-row" for="hidden"><input id="hidden" type="checkbox"/> Hidden network</label>';
    el<HTMLInputElement>('ssid').value=state.ssid;
    el<HTMLInputElement>('password').value=state.password;
    el<HTMLSelectElement>('security').value=state.security;
    el<HTMLInputElement>('hidden').checked=state.hidden;
    el<HTMLElement>('wifi-password-wrap').hidden=state.security==='nopass';
    for(const id of ['ssid','password','security'] as const){
      el<HTMLInputElement|HTMLSelectElement>(id).addEventListener('input',event=>{
        state={...state,[id]:(event.target as HTMLInputElement).value};
        if(id==='security')el<HTMLElement>('wifi-password-wrap').hidden=state.security==='nopass';
        schedule();
      });
    }
    el<HTMLInputElement>('hidden').addEventListener('change',event=>{state.hidden=(event.target as HTMLInputElement).checked;schedule();});
    return;
  }
  const labels:Record<Exclude<Kind,'wifi'>,string>={url:'Website URL',text:'Text',email:'Email address',phone:'Phone number',sms:'Phone number'};
  const placeholders:Record<Exclude<Kind,'wifi'>,string>={url:'https://example.com',text:'Enter any text',email:'hello@example.com',phone:'+212 600 000 000',sms:'+212 600 000 000'};
  const kind=state.kind;
  const multiline=kind==='text';
  container.innerHTML='<label for="value">'+labels[kind]+'</label>'+(multiline?'<textarea id="value" rows="4" placeholder="'+placeholders[kind]+'"></textarea>':'<input id="value" type="text" placeholder="'+placeholders[kind]+'"/>')+
    (kind==='email'?'<label for="subject">Subject (optional)</label><input id="subject" type="text" placeholder="Your email subject"/><label for="body">Email body (optional)</label><textarea id="body" rows="3" placeholder="Message text"></textarea>':'')+
    (kind==='sms'?'<label for="message">SMS message (optional)</label><textarea id="message" rows="3" placeholder="Message text"></textarea>':'');
  const value=el<HTMLInputElement|HTMLTextAreaElement>('value');
  value.value=state.value;
  value.addEventListener('input',()=>{state.value=value.value;schedule();});
  const extra=kind==='email'?['subject','body']:kind==='sms'?['message']:[];
  for(const id of extra){
    const input=el<HTMLInputElement|HTMLTextAreaElement>(id);
    input.value=String(state[id as 'subject'|'body'|'message']);
    input.addEventListener('input',()=>{state={...state,[id]:input.value};schedule();});
  }
}
function documentData():QrDocument {
  const payload=state.kind==='wifi'?encodePayload({kind:'wifi',ssid:state.ssid,password:state.password,security:state.security,hidden:state.hidden}):
    state.kind==='url'?encodePayload({kind:'url',value:state.value}):
    state.kind==='email'?encodePayload({kind:'email',address:state.value,subject:state.subject,body:state.body}):
    state.kind==='phone'?encodePayload({kind:'phone',number:state.value}):
    state.kind==='sms'?encodePayload({kind:'sms',number:state.value,message:state.message}):encodePayload({kind:'text',value:state.value});
  return {payload,size:state.size,margin:state.margin,foreground:state.foreground,background:state.background,correction:state.correction,dotStyle:state.dotStyle,...(state.logo?{logo:state.logo}:{})};
}
function feedback(message:string, isError=false) {const elx=el<HTMLDivElement>('feedback');elx.hidden=!message;elx.textContent=message;elx.classList.toggle('error',isError);}
function savePreferences() {
  const {logo,...settings}=state;
  localStorage.setItem('pfx-qr-studio-preferences',JSON.stringify(settings));
}
function schedule() {
  clearTimeout(debounce);
  pending++;
  savePreferences();
  lastValid=null;
  el<HTMLButtonElement>('download').disabled=true;
  el<HTMLButtonElement>('verify').disabled=true;
  el<HTMLButtonElement>('copy-image').disabled=true;
  el<HTMLElement>('verified-state').textContent='';
  el<HTMLElement>('status').textContent='Updating…';
  debounce=setTimeout(()=>{void render(pending);},180);
}
async function render(ticket:number) {
  try {
    const doc=documentData();
    const validation=validateDocument(doc);
    if(!validation.valid)throw new Error(validation.errors.join(' · '));
    const core=await corePromise;
    const artifact=await core.render(doc,'png');
    if(ticket!==pending)return;
    const blob=new Blob([Uint8Array.from(artifact.bytes)],{type:artifact.mimeType});
    const url=URL.createObjectURL(blob);
    preview.src=url;
    if(objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl=url;
    lastValid={blob,payload:doc.payload};
    el<HTMLButtonElement>('download').disabled=false;
    el<HTMLButtonElement>('verify').disabled=false;
    el<HTMLButtonElement>('copy-image').disabled=false;
    el<HTMLElement>('status').textContent='Ready';
    feedback(validation.warnings.join(' · '));
  }catch(error) {
    if(ticket!==pending)return;
    lastValid=null;
    preview.removeAttribute('src');
    el<HTMLElement>('status').textContent='Check input';
    feedback(error instanceof Error?error.message:String(error),true);
  }
}
function syncPalettes() {
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach(button=>{
    button.classList.toggle('selected',button.dataset.foreground===state.foreground && button.dataset.background===state.background);
  });
}
for(const key of ['foreground','background','correction','dotStyle','size','margin'] as const){
  const field=el<HTMLInputElement|HTMLSelectElement>(key);field.value=String(state[key]);
  field.addEventListener('input',()=>{state={...state,[key]:(key==='size'||key==='margin')?Number(field.value):field.value};if(key==='size'||key==='margin')el<HTMLOutputElement>(key+'-output').textContent=field.value+' px';syncPalettes();schedule();});
}
el<HTMLOutputElement>('size-output').textContent=state.size+' px';
el<HTMLOutputElement>('margin-output').textContent=state.margin+' px';
el<HTMLSelectElement>('kind').value=state.kind;
el<HTMLSelectElement>('kind').addEventListener('change',e=>{valuesByKind[state.kind]=state.value;const kind=(e.target as HTMLSelectElement).value as Kind;state.kind=kind;state.value=valuesByKind[kind]??(kind==='url'?'https://example.com':'');displayFields();schedule();});
el<HTMLInputElement>('logo').addEventListener('change',async e=>{
  const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
  if(file.size>1_500_000){feedback('Logo must be smaller than 1.5 MB',true);return;}
  if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)){feedback('Unsupported logo format',true);return;}
  const reader=new FileReader();reader.onload=()=>{state.logo=String(reader.result);schedule();};reader.readAsDataURL(file);
});
el<HTMLButtonElement>('remove-logo').addEventListener('click',()=>{state.logo=undefined;el<HTMLInputElement>('logo').value='';schedule();});
el<HTMLButtonElement>('download').addEventListener('click',async ()=>{
  try {
    const format=el<HTMLSelectElement>('format').value as QrRenderFormat;
    const doc=documentData();
    const check=validateDocument(doc);if(!check.valid)throw new Error(check.errors.join(' · '));
    const core=await corePromise;
    const artifact=await core.render(doc,format);
    const blob=new Blob([Uint8Array.from(artifact.bytes)],{type:artifact.mimeType});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='pfx-qr.'+format;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){feedback(error instanceof Error?error.message:String(error),true);}
});
function setTheme(isDark:boolean) {
  document.documentElement.classList.toggle('dark',isDark);
  el<HTMLButtonElement>('theme').textContent=isDark?'Light mode':'Dark mode';
  localStorage.setItem('pfx-qr-studio-theme',isDark?'dark':'light');
}
el<HTMLButtonElement>('theme').addEventListener('click',()=>setTheme(!document.documentElement.classList.contains('dark')));
setTheme(localStorage.getItem('pfx-qr-studio-theme')==='dark');
document.querySelectorAll<HTMLButtonElement>('.preset').forEach(button=>{
  button.addEventListener('click',()=>{
    state.foreground=button.dataset.foreground??initial.foreground;
    state.background=button.dataset.background??initial.background;
    el<HTMLInputElement>('foreground').value=state.foreground;
    el<HTMLInputElement>('background').value=state.background;
    syncPalettes();schedule();
  });
});
el<HTMLButtonElement>('reset').addEventListener('click',()=>{
  state={...initial};
  for(const k of ['foreground','background','correction','dotStyle','size','margin'] as const)el<HTMLInputElement|HTMLSelectElement>(k).value=String(state[k]);
  el<HTMLOutputElement>('size-output').textContent=state.size+' px';
  el<HTMLOutputElement>('margin-output').textContent=state.margin+' px';
  el<HTMLSelectElement>('kind').value=state.kind;
  el<HTMLInputElement>('logo').value='';
  for(const k of Object.keys(valuesByKind) as Kind[])delete valuesByKind[k];
  valuesByKind.url=state.value;
  displayFields();syncPalettes();schedule();
});
el<HTMLButtonElement>('verify').addEventListener('click',async()=>{
  const item=lastValid;
  if(!item)return;
  const output=el<HTMLElement>('verified-state');
  output.textContent='Testing the QR with the built-in scanner…';
  output.className='verified-state';
  try {
    const core=await corePromise;
    const result=await core.verify(item.blob,item.payload);
    if(item!==lastValid)return;
    output.textContent=result?'Scan passed — QR content matches.':'Scan did not match. Try a higher-contrast design.';
    output.className='verified-state '+(result?'success':'failure');
  }catch(error) {
    if(item!==lastValid)return;
    output.textContent='Could not test scan: '+(error instanceof Error?error.message:String(error));
    output.className='verified-state failure';
  }
});
el<HTMLButtonElement>('copy-image').addEventListener('click',async()=>{
  const item=lastValid;if(!item)return;
  try {
    if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error('Image clipboard is not available in this browser');
    await navigator.clipboard.write([new ClipboardItem({'image/png':item.blob})]);
    el<HTMLElement>('verified-state').textContent='PNG copied to clipboard.';
  }catch(error){feedback(error instanceof Error?error.message:String(error),true);}
});
el<HTMLButtonElement>('copy-content').addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(documentData().payload);
    el<HTMLElement>('verified-state').textContent='QR content copied.';
  }catch(error){feedback(error instanceof Error?error.message:String(error),true);}
});
el<HTMLInputElement>('scan-file').addEventListener('change',async event=>{
  const file=(event.target as HTMLInputElement).files?.[0];
  if(!file)return;
  const ticket=++scanTicket;
  const status=el<HTMLElement>('scan-status');
  const wrap=el<HTMLElement>('scan-result-wrap');
  wrap.hidden=true;
  lastDecoded='';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10_000_000){
    status.textContent='Choose a PNG, JPEG or WebP image smaller than 10 MB.';
    status.className='scan-status failure';
    return;
  }
  status.textContent='Scanning image locally…';
  status.className='scan-status';
  try {
    const core=await corePromise;
    const decoded=await core.decode(file);
    if(ticket!==scanTicket)return;
    if(decoded===null){status.textContent='No QR code found in this image.';status.className='scan-status failure';return;}
    lastDecoded=decoded;
    el<HTMLTextAreaElement>('scan-result').value=decoded;
    wrap.hidden=false;
    status.textContent='QR decoded successfully.';
    status.className='scan-status success';
  }catch(error){
    if(ticket!==scanTicket)return;
    status.textContent='Unable to scan: '+(error instanceof Error?error.message:String(error));
    status.className='scan-status failure';
  }
});
el<HTMLButtonElement>('copy-scan').addEventListener('click',async()=>{
  if(!lastDecoded)return;
  try{await navigator.clipboard.writeText(lastDecoded);el<HTMLElement>('scan-status').textContent='Decoded content copied.';}
  catch(error){el<HTMLElement>('scan-status').textContent=error instanceof Error?error.message:String(error);}
});
syncPalettes();
displayFields();schedule();
