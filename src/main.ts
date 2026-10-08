import { createBrowserQrCore, encodePayload, validateDocument } from '@pfxamd/qr-core';
import type { QrDocument, QrRenderFormat } from '@pfxamd/qr-core';
import './style.css';

type Kind = 'url' | 'text' | 'email' | 'phone' | 'sms' | 'wifi';
type Form = { kind: Kind; value: string; ssid: string; password: string; security: 'WPA' | 'WEP' | 'nopass'; size: number; foreground: string; background: string; correction: 'L'|'M'|'Q'|'H'; dotStyle: QrDocument['dotStyle']; logo?: string; };
const initial: Form = {kind:'url',value:'https://example.com',ssid:'',password:'',security:'WPA',size:640,foreground:'#111827',background:'#ffffff',correction:'H',dotStyle:'square'};
const saved = localStorage.getItem('pfx-qr-studio-preferences');
let state: Form = {...initial};
if (saved) { try {const json: unknown=JSON.parse(saved); if(json && typeof json==='object'){const o=json as Partial<Form>;state={...initial,...o,logo:undefined};}} catch {/* ignore invalid storage */} }
let lastValid: {blob: Blob; format: QrRenderFormat} | null = null;
let pending = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar"><a class="brand" href="./" aria-label="PFx QR Studio home"><span class="brand-mark">P<span>F</span>x</span><span>QR Studio <small>ALPHA 0.1</small></span></a><span class="top-note">Local-first QR design workspace</span><button id="theme" class="ghost" type="button">Theme</button></header>
  <main class="workspace">
    <section class="editor" aria-label="QR settings">
      <div class="section-heading"><span class="eyebrow">DESIGN WORKSPACE</span><h1>Create QR code</h1><p>Configure your content and customize the result.</p></div>
      <div class="panel"><h2>Content</h2><label for="kind">Content type</label><select id="kind"><option value="url">Website URL</option><option value="text">Plain text</option><option value="email">Email</option><option value="phone">Phone</option><option value="sms">SMS</option><option value="wifi">Wi-Fi network</option></select><div id="content-fields"></div></div>
      <div class="panel"><h2>Appearance</h2><div class="two-cols"><div><label for="foreground">QR color</label><input id="foreground" type="color"/></div><div><label for="background">Background</label><input id="background" type="color"/></div></div><label for="dotStyle">Module style</label><select id="dotStyle"><option value="square">Square</option><option value="rounded">Rounded</option><option value="dots">Dots</option><option value="classy">Classy</option><option value="classy-rounded">Classy rounded</option><option value="extra-rounded">Extra rounded</option></select><label for="correction">Error correction</label><select id="correction"><option value="L">Low</option><option value="M">Medium</option><option value="Q">Quartile</option><option value="H">High</option></select></div>
      <div class="panel"><h2>Export settings</h2><label for="size">Resolution <output id="size-output">640 px</output></label><input id="size" type="range" min="256" max="2048" step="128"/><label for="logo">Center logo (optional)</label><input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"/><button class="ghost small" id="remove-logo" type="button">Remove logo</button></div>
    </section>
    <section class="preview-side" aria-label="QR preview">
      <div class="preview-top"><span class="eyebrow">LIVE PREVIEW</span><span id="status" role="status" aria-live="polite">Initializing…</span></div>
      <div class="preview-stage"><div class="qr-mat"><img id="qr-preview" alt="Generated QR code preview" width="320" height="320"/></div></div>
      <div id="feedback" role="alert" class="feedback" hidden></div>
      <div class="output-actions"><label for="format">Download as</label><div class="download-row"><select id="format"><option value="png">PNG</option><option value="svg">SVG</option><option value="webp">WebP</option></select><button id="download" class="primary" type="button" disabled>Download QR</button></div><p>Created locally in your browser. No image uploads.</p></div>
    </section>
  </main><footer>PFx QR Studio <span>Powered by PFx QR Core</span></footer>`;
const $ = <T extends HTMLElement>(selector:string) => document.querySelector<T>(selector)!;
const el = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const preview=el<HTMLImageElement>('qr-preview');
let objectUrl: string | null=null;
const corePromise=createBrowserQrCore();
function displayFields() {
  const container=el<HTMLDivElement>('content-fields');
  if (state.kind==='wifi') {
    container.innerHTML='<label for="ssid">Network name</label><input id="ssid" type="text" placeholder="Wi-Fi SSID"/><label for="security">Security</label><select id="security"><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option><option value="nopass">Open network</option></select><label for="password">Password</label><input id="password" type="text" autocomplete="off"/>';
    el<HTMLInputElement>('ssid').value=state.ssid;el<HTMLInputElement>('password').value=state.password;el<HTMLSelectElement>('security').value=state.security;
    for (const id of ['ssid','password','security'] as const) {
      el<HTMLInputElement|HTMLSelectElement>(id).addEventListener('input',event=>{state={...state,[id]:(event.target as HTMLInputElement).value};schedule();});
    }
    return;
  }
  const multiline=state.kind==='text';
  container.innerHTML=multiline ? '<label for="value">Text</label><textarea id="value" rows="4" placeholder="Enter text"></textarea>' : '<label for="value">Value</label><input id="value" type="text" placeholder="Enter content"/>';
  el<HTMLInputElement|HTMLTextAreaElement>('value').value=state.value;
  el<HTMLInputElement|HTMLTextAreaElement>('value').addEventListener('input',e=>{state.value=(e.target as HTMLInputElement).value;schedule();});
}
function documentData():QrDocument {
  const payload=state.kind==='wifi'?encodePayload({kind:'wifi',ssid:state.ssid,password:state.password,security:state.security}):
    state.kind==='url'?encodePayload({kind:'url',value:state.value}):
    state.kind==='email'?encodePayload({kind:'email',address:state.value}):
    state.kind==='phone'?encodePayload({kind:'phone',number:state.value}):
    state.kind==='sms'?encodePayload({kind:'sms',number:state.value}):encodePayload({kind:'text',value:state.value});
  return {payload,size:state.size,margin:32,foreground:state.foreground,background:state.background,correction:state.correction,dotStyle:state.dotStyle,...(state.logo?{logo:state.logo}:{})};
}
function feedback(message:string, isError=false) {const elx=el<HTMLDivElement>('feedback');elx.hidden=!message;elx.textContent=message;elx.classList.toggle('error',isError);}
function schedule() {clearTimeout(debounce);pending++;el<HTMLButtonElement>('download').disabled=true;el<HTMLElement>('status').textContent='Updating…';debounce=setTimeout(()=>{void render(pending);},180);}
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
    lastValid={blob,format:'png'};
    el<HTMLButtonElement>('download').disabled=false;
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
for(const key of ['foreground','background','correction','dotStyle','size'] as const){
  const field=el<HTMLInputElement|HTMLSelectElement>(key);field.value=String(state[key]);
  field.addEventListener('input',()=>{state={...state,[key]:key==='size'?Number(field.value):field.value};if(key==='size')el<HTMLOutputElement>('size-output').textContent=field.value+' px';schedule();});
}
el<HTMLOutputElement>('size-output').textContent=state.size+' px';
el<HTMLSelectElement>('kind').value=state.kind;
el<HTMLSelectElement>('kind').addEventListener('change',e=>{state.kind=(e.target as HTMLSelectElement).value as Kind;displayFields();schedule();});
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
el<HTMLButtonElement>('theme').addEventListener('click',()=>{document.documentElement.classList.toggle('dark');localStorage.setItem('pfx-qr-studio-theme',document.documentElement.classList.contains('dark')?'dark':'light');});
if(localStorage.getItem('pfx-qr-studio-theme')==='dark')document.documentElement.classList.add('dark');
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){const {logo,...settings}=state;localStorage.setItem('pfx-qr-studio-preferences',JSON.stringify(settings));}});
displayFields();schedule();
