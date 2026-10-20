import { createBrowserQrCore, encodePayload, validateDocument } from '@pfxamd/qr-core';
import type { QrDocument, QrRenderFormat } from '@pfxamd/qr-core';
import './style.css';

declare const __PFX_BUILD_VERSION__: string;

type Kind = 'url' | 'text' | 'email' | 'phone' | 'sms' | 'wifi';
type Form = { kind: Kind; value: string; ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; hidden: boolean; subject: string; body: string; message: string; size: number; margin: number; foreground: string; background: string; correction: 'L'|'M'|'Q'|'H'; dotStyle: QrDocument['dotStyle']; logo?: string; };
const initial: Form = {kind:'url',value:'https://example.com',ssid:'',password:'',security:'WPA',hidden:false,subject:'',body:'',message:'',size:640,margin:24,foreground:'#22392e',background:'#ffffff',correction:'H',dotStyle:'square'};
const saved = localStorage.getItem('pfx-qr-studio-preferences');
let state: Form = {...initial};
if (saved) { try {const json: unknown=JSON.parse(saved); if(json && typeof json==='object'){const o=json as Partial<Form>;state={...initial,...o,logo:undefined};}} catch {/* ignore invalid storage */} }
let lastValid: {blob: Blob; payload: string} | null = null;
let lastDecoded = '';
let activePanel='content';
let scanTicket = 0;
let pending = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
const app = document.querySelector<HTMLDivElement>('#app')!;
const glyph=(paths:string):string=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
const icons={
  content:glyph('<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>'),
  style:glyph('<path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2h1.5A4.1 4.1 0 0 0 22 10.5 9 9 0 0 0 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="17" cy="9" r="1"/>'),
  export:glyph('<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v3h16v-3"/>'),
  scan:glyph('<path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><path d="M7 12h10"/>'),
  moon:glyph('<path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.8 8.8 0 1 0 10.7 10.7Z"/>'),
  sun:glyph('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  check:glyph('<path d="m5 12 4.5 4.5L19 7"/>'),
  copy:glyph('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  reset:glyph('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  close:glyph('<path d="M5 5 19 19M19 5 5 19"/>'),
  arrow:glyph('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  lock:glyph('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')
};

app.innerHTML = `<header class="app-topbar">
  <div class="header-brand">
    <a class="brand" href="https://www.pfxamd.com" target="_blank" rel="noopener noreferrer" aria-label="PFxAMD home">
      <img src="/pfx-qr-studio/pfx-logo.svg" class="brand-logo" alt="" width="38" height="34">
      <span class="brand-wordmark">PFx <strong>QR Studio</strong></span>
    </a>
    <span class="brand-divider"></span>
    <span class="release-badge" aria-label="Current alpha release v${__PFX_BUILD_VERSION__}" title="Exact published build version"><span class="release-stage">ALPHA</span><span class="release-version">v${__PFX_BUILD_VERSION__}</span></span>
  </div>
  <div class="header-actions"><span class="local-pill"><span class="privacy-dot"></span>ON-DEVICE WORKSPACE</span>
    <button id="reset" type="button" class="header-icon-button" title="Reset all settings" aria-label="Reset all settings">${icons.reset}</button>
    <button id="theme" type="button" class="header-icon-button" title="Change appearance" aria-label="Switch to dark theme">${icons.moon}</button>
  </div>
</header>
<main class="app-shell" id="app-shell" aria-label="QR Studio workspace">
  <nav class="tool-rail" aria-label="Workspace tools">
    <div class="rail-caption">TOOLS</div>
    <button type="button" class="rail-button is-active" data-panel="content" aria-controls="view-content" aria-selected="true">${icons.content}<span>Content</span></button>
    <button type="button" class="rail-button" data-panel="style" aria-controls="view-style" aria-selected="false">${icons.style}<span>Design</span></button>
    <button type="button" class="rail-button" data-panel="export" aria-controls="view-export" aria-selected="false">${icons.export}<span>Output</span></button>
    <button type="button" class="rail-button" data-panel="scan" aria-controls="view-scan" aria-selected="false">${icons.scan}<span>Scanner</span></button>
    <div class="rail-bottom"><div class="rail-diamond"></div><span>PFx STUDIO</span></div>
  </nav>
  <div id="panel-backdrop" class="panel-backdrop" hidden></div>
  <aside class="settings-column" id="settings-column" aria-label="QR customization panel">
    <div class="settings-topline"><span><span class="topline-symbol">✳</span> CONFIGURATION</span><button id="close-panel" class="close-panel" type="button" aria-label="Close settings">${icons.close}</button></div>
    <section class="tool-view is-active" id="view-content" data-view="content">
      <div class="tool-view-heading"><div class="view-kicker">CONTENT</div><h2>What does it <em>open?</em></h2><p>Start with a link, message or network.</p></div>
      <div class="tool-scroll">
        <div class="field-block"><label for="kind">CONTENT TYPE</label><select id="kind"><option value="url">Website / YouTube</option><option value="text">Text</option><option value="email">Email</option><option value="phone">Phone call</option><option value="sms">Text message / SMS</option><option value="wifi">Wi-Fi network</option></select></div>
        <div id="content-fields" class="content-fields"></div>
        <div class="panel-note"><span class="mini-dot"></span> The QR updates as you type. No manual generate step.</div>
      </div>
      <div class="view-foot"><span>DATA / IN BROWSER</span><span class="view-foot-line"></span></div>
    </section>
    <section class="tool-view" id="view-style" data-view="style">
      <div class="tool-view-heading"><div class="view-kicker">DESIGN</div><h2>Give it <em>character.</em></h2><p>Shape, contrast and color, all in balance.</p></div>
      <div class="tool-scroll">
        <div class="field-block"><label>CURATED PALETTES</label>
          <div class="preset-row" role="group" aria-label="Color presets">
            <button type="button" class="preset" data-foreground="#22392e" data-background="#ffffff"><i style="background:#22392e"></i><span>Forest</span></button>
            <button type="button" class="preset" data-foreground="#a64e38" data-background="#ffffff"><i style="background:#a64e38"></i><span>Clay</span></button>
            <button type="button" class="preset" data-foreground="#161e1a" data-background="#ffffff"><i style="background:#161e1a"></i><span>Ink</span></button>
            <button type="button" class="preset" data-foreground="#ffffff" data-background="#22392e"><i style="background:#22392e;border:1px solid #fff"></i><span>Inverse</span></button>
          </div>
        </div>
        <div class="field-block"><div class="two-cols">
          <div><label for="foreground">QR COLOR</label><div class="color-well"><input id="foreground" type="color"><span>Foreground</span></div></div>
          <div><label for="background">BACKGROUND</label><div class="color-well"><input id="background" type="color"><span>Surface</span></div></div>
        </div></div>
        <div class="field-block"><label for="dotStyle">MODULE SHAPE</label><select id="dotStyle"><option value="square">Sharp / Square</option><option value="rounded">Rounded</option><option value="dots">Circular dots</option><option value="classy">Classy</option><option value="classy-rounded">Classy rounded</option><option value="extra-rounded">Extra rounded</option></select></div>
        <div class="field-block"><label for="correction">ERROR CORRECTION</label><select id="correction"><option value="L">L — Low / More capacity</option><option value="M">M — Medium</option><option value="Q">Q — Quartile</option><option value="H">H — High / Best for logos</option></select></div>
        <div class="panel-note"><span class="mini-dot"></span> Strong contrast helps every scan.</div>
      </div>
      <div class="view-foot"><span>VISUAL / CUSTOM</span><span class="view-foot-line"></span></div>
    </section>
    <section class="tool-view" id="view-export" data-view="export">
      <div class="tool-view-heading"><div class="view-kicker">OUTPUT</div><h2>Pixel <em>perfect.</em></h2><p>Made for screens, print and everything between.</p></div>
      <div class="tool-scroll">
        <div class="field-block"><label for="size">RESOLUTION <output id="size-output">640 px</output></label><input id="size" type="range" min="128" max="4096" step="64"><div class="range-extents"><span>128 PX</span><span>4096 PX</span></div></div>
        <div class="field-block"><label for="margin">QUIET ZONE <output id="margin-output">24 px</output></label><input id="margin" type="range" min="0" max="128" step="8"><div class="range-extents"><span>0 PX</span><span>128 PX</span></div><p class="field-hint">Space around your symbol for easy scanning.</p></div>
        <div class="field-block"><label for="logo">CENTER LOGO</label><input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"><button type="button" class="inline-action" id="remove-logo">Remove image ${icons.close}</button><p class="field-hint">PNG, JPG, WebP or SVG. Max 1.5 MB.</p></div>
        <div class="panel-note"><span class="mini-dot"></span> Use “Test scan” before printing.</div>
      </div>
      <div class="view-foot"><span>HIGH RES / LOCAL</span><span class="view-foot-line"></span></div>
    </section>
    <section class="tool-view" id="view-scan" data-view="scan">
      <div class="tool-view-heading"><div class="view-kicker">SCANNER</div><h2>Read the <em>signal.</em></h2><p>Decode an existing QR without uploading it.</p></div>
      <div class="tool-scroll">
        <div class="scanner-frame">${icons.scan}<strong>Decode an image</strong><p>Choose a QR image from your device. The scanner runs entirely in your browser.</p>
          <label class="scan-file" for="scan-file">Choose QR image ${icons.arrow}</label><input id="scan-file" class="scanner-file-input" type="file" accept="image/png,image/jpeg,image/webp"/>
          <small>PNG / JPG / WEBP — MAX 10 MB</small></div>
        <div id="scan-status" class="scan-status" role="status" aria-live="polite"></div>
        <div id="scan-result-wrap" class="scan-result-wrap" hidden><label for="scan-result">DECODED CONTENT</label><textarea id="scan-result" rows="4" readonly></textarea><button id="copy-scan" class="secondary full" type="button">${icons.copy} Copy result</button></div>
        <div class="panel-note"><span class="mini-dot"></span> Uploaded files never leave this device.</div>
      </div>
      <div class="view-foot"><span>READER / PRIVATE</span><span class="view-foot-line"></span></div>
    </section>
  </aside>
  <section class="canvas-column" aria-label="QR live preview">
    <div class="canvas-heading"><div class="canvas-heading-left"><span class="micro-label">PFx LABORATORY <span class="heading-split">/</span> QR COMPOSITION</span><h1>Make it <em>yours.</em></h1></div><span class="status-pill"><span class="status-dot"></span><span id="status" role="status" aria-live="polite">Initializing…</span></span></div>
    <div class="preview-stage">
      <div class="stage-top"><span>LIVE CANVAS</span><span>QR / GENERATOR</span></div>
      <div class="stage-body"><div class="stage-guide"><span class="guide-corner corner-tl"></span><span class="guide-corner corner-tr"></span><span class="guide-corner corner-bl"></span><span class="guide-corner corner-br"></span>
        <div class="qr-mat"><img id="qr-preview" alt="Generated QR code preview" width="320" height="320"/></div></div></div>
      <div class="stage-bottom"><span>ORIGINAL WORK</span><span id="preview-meta">640 × 640 PX</span></div>
    </div>
    <div class="feedback-area" aria-live="polite"><div id="feedback" role="alert" class="feedback" hidden></div><div id="verified-state" class="verified-state" role="status"></div></div>
    <div class="action-dock">
      <div class="dock-caption"><span class="micro-label">EXPORT STUDIO</span><span id="payload-preview">Ready to create.</span></div>
      <div class="dock-controls"><select id="format" title="Export format" aria-label="Download format"><option value="png">PNG</option><option value="svg">SVG</option><option value="webp">WebP</option></select>
        <button id="verify" class="secondary icon-action" type="button" aria-label="Test QR scanning" title="Test QR scanning" disabled>${icons.check}<span>Test scan</span></button>
        <button id="copy-image" class="secondary icon-action" type="button" aria-label="Copy QR as PNG" title="Copy QR as PNG" disabled>${icons.copy}<span>Copy PNG</span></button>
        <button id="copy-content" class="secondary icon-action" type="button" aria-label="Copy QR content" title="Copy QR content">${icons.content}<span>Copy data</span></button>
        <button id="download" class="download-action" type="button" disabled>Download QR ${icons.arrow}</button>
      </div>
    </div>
  </section>
</main>
<footer class="app-footer"><div class="footer-left"><span class="signature-spark">✳</span><span>AN ORIGINAL PFx TOOL</span><span class="footer-separator"></span><span>PRIVATELY GENERATED IN YOUR BROWSER</span></div><a class="signature" href="https://www.pfxamd.com" target="_blank" rel="noopener noreferrer" aria-label="Visit PFxAMD website">DESIGNED &amp; CRAFTED BY <strong>PFxAMD<em>.</em></strong></a><div class="footer-right">MOROCCO <span>© 2026</span></div></footer>`;
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
  updatePreviewInfo();
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
    updatePreviewInfo();
    feedback(validation.warnings.join(' · '));
  }catch(error) {
    if(ticket!==pending)return;
    lastValid=null;
    preview.removeAttribute('src');
    el<HTMLElement>('status').textContent='Check input';
    feedback(error instanceof Error?error.message:String(error),true);
  }
}
function updatePreviewInfo() {
  const raw=state.kind==='wifi'?state.ssid:state.value;
  const value=raw.trim() || 'Enter content to begin';
  el<HTMLElement>('payload-preview').textContent=value;
  el<HTMLElement>('preview-meta').textContent=state.size+' × '+state.size+' PX / '+state.dotStyle.toUpperCase();
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
  const toggle=el<HTMLButtonElement>('theme');
  toggle.innerHTML=isDark?icons.sun:icons.moon;
  toggle.setAttribute('aria-label',isDark?'Switch to light theme':'Switch to dark theme');
  toggle.title=isDark?'Light appearance':'Dark appearance';
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
function isCompactLayout():boolean{return window.matchMedia('(max-width:800px)').matches;}
function closeSettings() {
  el<HTMLElement>('settings-column').classList.remove('is-open');
  el<HTMLElement>('panel-backdrop').hidden=true;
}
function switchPanel(next:string,openOnMobile=true) {
  const wasOpen=el<HTMLElement>('settings-column').classList.contains('is-open');
  const same=activePanel===next;
  activePanel=next;
  document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>{
    const selected=button.dataset.panel===next;
    button.classList.toggle('is-active',selected);
    button.setAttribute('aria-selected',String(selected));
  });
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(view=>{
    const selected=view.dataset.view===next;
    view.classList.toggle('is-active',selected);
    if(selected)view.querySelector<HTMLElement>('.tool-scroll')?.scrollTo({top:0});
  });
  if(isCompactLayout()){
    if(same&&wasOpen){closeSettings();return;}
    if(openOnMobile){
      el<HTMLElement>('settings-column').classList.add('is-open');
      el<HTMLElement>('panel-backdrop').hidden=false;
    }
  }else{closeSettings();}
}
document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button=>{
  button.addEventListener('click',()=>switchPanel(button.dataset.panel??'content'));
});
el<HTMLButtonElement>('close-panel').addEventListener('click',closeSettings);
el<HTMLElement>('panel-backdrop').addEventListener('click',closeSettings);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&el<HTMLElement>('settings-column').classList.contains('is-open'))closeSettings();
});
window.addEventListener('resize',()=>{if(!isCompactLayout())closeSettings();});
el<HTMLSelectElement>('format').addEventListener('change',updatePreviewInfo);
syncPalettes();
displayFields();schedule();
