import{r as f,j as e}from"./vendor-react-BjxQnpua.js";import{b as L,c as $,u as W}from"./vendor-query-BOVVqqRq.js";import{u as q}from"./vendor-router-zIkAIo_Y.js";import{a as O,t as F}from"./trades-api-fpI9U5QN.js";import{T}from"./index-DYpVr4S_.js";import{X as Y}from"./vendor-lucide-CG1xpyR4.js";import"./helpers-ChQ818WN.js";import"./vendor-radix-BeYeHBLa.js";import"./vendor-motion-DTfMEuUs.js";import"./vendor-forms-CThSqFLs.js";const t={ink:T.INK,sky:T.ACCENT,white:"#FFFFFF",gray:"#D9D7D7",sheet:T.OFFW,body:"#E8E8E8",mute:"#8C8C8C",red:"#C71A2A"},M={firstName:"",lastName:"",email:"",phone:"",siteAddress:"",preferredChannel:"email",notes:""};function _(r){return"$"+(r/100).toLocaleString("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2})}function I(r){const s=r.currentTarget;s.classList.remove("cdir-pulse"),s.offsetWidth,s.classList.add("cdir-pulse")}function b({label:r,value:s,onChange:o,placeholder:c,required:n,type:p="text"}){return e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("div",{style:{fontSize:11,fontWeight:600,color:t.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:[r,n?" *":""]}),e.jsx("input",{type:p,value:s,onChange:u=>o(u.target.value),placeholder:c,style:{width:"100%",padding:"14px 16px",borderRadius:14,background:t.gray,border:"none",outline:"none",color:t.ink,fontSize:15,fontWeight:500,boxSizing:"border-box",fontFamily:"inherit"}})]})}function P({label:r,value:s,onChange:o,placeholder:c}){return e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:t.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:r}),e.jsx("textarea",{value:s,onChange:n=>o(n.target.value),placeholder:c,style:{width:"100%",minHeight:88,resize:"vertical",padding:"14px 16px",borderRadius:14,background:t.gray,border:"none",outline:"none",color:t.ink,fontSize:15,fontWeight:500,boxSizing:"border-box",fontFamily:"inherit"}})]})}function X({onClose:r,onSave:s,saving:o,saveError:c}){const[n,p]=f.useState(M),[u,k]=f.useState(!1),d=h=>x=>{p(A=>({...A,[h]:x}))},g=n.preferredChannel==="email"?!!n.email.trim():!!n.phone.trim(),m=!!n.firstName.trim()&&!!n.lastName.trim()&&!!n.siteAddress.trim()&&g,y=()=>{k(!0),setTimeout(r,320)},C=()=>{!m||o||s(n)};return e.jsxs("div",{style:{position:"fixed",inset:0,zIndex:100},children:[e.jsx("style",{children:`
        @keyframes atSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes atSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes atFdIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atFdOut { from { opacity: 1; } to { opacity: 0; } }
      `}),e.jsx("div",{onClick:y,style:{position:"absolute",inset:0,background:"rgba(4,13,109,0.55)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",animation:u?"atFdOut 0.28s ease both":"atFdIn 0.28s ease both"}}),e.jsx("div",{style:{position:"absolute",bottom:0,left:0,right:0,display:"flex",justifyContent:"center"},children:e.jsxs("div",{style:{width:"100%",maxWidth:430,background:t.sheet,borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto",animation:u?"atSlideDown 0.32s cubic-bezier(0.4,0,0.2,1) both":"atSlideUp 0.38s cubic-bezier(0.16,1,0.3,1) both"},children:[e.jsx("div",{style:{display:"flex",justifyContent:"center",padding:"14px 0 2px"},children:e.jsx("div",{style:{width:36,height:4,borderRadius:2,background:"rgba(0,0,0,0.1)"}})}),e.jsxs("div",{style:{padding:"12px 24px 52px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24},children:[e.jsx("span",{style:{fontWeight:700,fontSize:20,color:t.ink,letterSpacing:"-0.3px"},children:"add client"}),e.jsx("button",{onClick:y,"aria-label":"Close add client sheet",style:{width:32,height:32,borderRadius:999,background:t.gray,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(Y,{size:15,color:t.ink,strokeWidth:2.4})})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"},children:[e.jsx(b,{label:"first name",value:n.firstName,onChange:d("firstName"),required:!0}),e.jsx(b,{label:"last name",value:n.lastName,onChange:d("lastName"),required:!0})]}),e.jsx(b,{label:"site address",value:n.siteAddress,onChange:d("siteAddress"),required:!0}),e.jsx(b,{label:"email",value:n.email,onChange:d("email"),type:"email"}),e.jsx(b,{label:"phone",value:n.phone,onChange:d("phone"),type:"tel"}),e.jsxs("div",{style:{marginBottom:24},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:t.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8},children:"send invoice via"}),e.jsx("div",{style:{display:"flex",gap:8},children:["email","whatsapp","sms"].map(h=>e.jsx("button",{onClick:()=>p(x=>({...x,preferredChannel:h})),style:{flex:1,padding:"13px 0",borderRadius:14,border:"none",background:n.preferredChannel===h?t.ink:t.gray,color:n.preferredChannel===h?t.white:t.ink,fontWeight:600,fontSize:12.5,cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.04em",transition:"background 0.18s, color 0.18s"},children:h},h))}),!g&&e.jsxs("div",{style:{marginTop:8,fontSize:12,color:t.red,fontWeight:500},children:["add ",n.preferredChannel==="email"?"an email address":"a phone number"," above to send via ",n.preferredChannel]})]}),e.jsx(P,{label:"notes",value:n.notes,onChange:d("notes"),placeholder:"job access, parking, gate code"}),c&&e.jsx("div",{style:{marginBottom:16,padding:"12px 16px",borderRadius:14,background:"rgba(255,59,78,0.07)",border:"1px solid rgba(255,59,78,0.18)"},children:e.jsx("p",{style:{color:t.red,fontSize:13,fontWeight:500,margin:0},children:c})}),e.jsx("button",{onClick:C,disabled:!m||o,style:{width:"100%",padding:"18px 0",borderRadius:999,background:m&&!o?t.ink:t.gray,color:m&&!o?t.white:t.mute,fontWeight:700,fontSize:16,border:"none",cursor:m&&!o?"pointer":"default",transition:"background 0.2s, color 0.2s"},children:o?"adding…":"add client"})]})]})})]})}function H(r){var s,o;return`${((s=r.firstName)==null?void 0:s[0])??""}${((o=r.lastName)==null?void 0:o[0])??""}`.toUpperCase()||"?"}const K=["pending_dispatch","dispatched","viewed","deposit_paid","balance_due","dispatch_failed"];function R(r){return r?r.status==="overdue"?!0:!!r.dueAt&&new Date(r.dueAt).getTime()<Date.now()&&!["paid","paid_external","voided"].includes(r.status):!1}function Q(r){return r!=null&&r.dueAt?new Date(r.dueAt).toLocaleDateString("en-NZ",{day:"2-digit",month:"2-digit"}):""}function U({client:r,nextInvoice:s,onClick:o}){const c=`${r.firstName??""} ${r.lastName??""}`.trim()||"client",n=R(s),p=s&&["paid","paid_external"].includes(s.status),u=n?"overdue":p?"paid":"next invoice";return e.jsxs("button",{type:"button",className:"cdir-row",onClick:o,children:[e.jsx("span",{className:"cdir-avatar",children:H(r)}),e.jsxs("span",{className:"cdir-copy",children:[e.jsx("span",{className:"cdir-name",children:c}),e.jsx("span",{className:"cdir-address",children:r.siteAddress||"no site address"})]}),e.jsxs("span",{className:"cdir-money",children:[e.jsx("span",{children:s?_(s.amountCents??0):"—"}),s?e.jsxs("small",{className:n?"overdue":"",children:[u,e.jsx("br",{}),Q(s)]}):e.jsx("small",{children:"no invoice"})]})]})}function oe(){const[,r]=q(),[s,o]=f.useState(""),[c,n]=f.useState(!1),[p,u]=f.useState(!1),[k,d]=f.useState(null),g=L(),{data:m=[],isLoading:y}=$({queryKey:["/api/trades/clients"],queryFn:()=>F("/api/trades/clients").then(i=>i.ok?i.json():[]),staleTime:6e4,retry:!1}),{data:C=[]}=$({queryKey:["/api/trades/invoices"],queryFn:()=>F("/api/trades/invoices").then(i=>i.ok?i.json():[]),staleTime:3e4,retry:!1}),{data:S=[]}=$({queryKey:["/api/trades/clients","archived"],queryFn:()=>F("/api/trades/clients?includeArchived=true").then(i=>i.ok?i.json():[]),select:i=>i.filter(a=>a.status==="archived"),enabled:p,staleTime:3e4,retry:!1}),N=W({mutationFn:async i=>{const a=await fetch("/api/trades/clients",{method:"POST",headers:{"Content-Type":"application/json",...O()},body:JSON.stringify(i)});if(!a.ok){const v=await a.json().then(j=>j.message).catch(()=>`Error ${a.status}`);throw new Error(v)}return a.json()},onSuccess:()=>{g.invalidateQueries({queryKey:["/api/trades/clients"]}),d(null),n(!1)},onError:i=>{d(i instanceof Error?i.message:"Failed to add client. The backend may not be connected yet.")}}),z=W({mutationFn:async i=>{const a=await fetch(`/api/trades/clients/${i}/unarchive`,{method:"POST",headers:O()});if(!a.ok)throw new Error("Failed to restore");return a.json()},onSuccess:()=>{g.invalidateQueries({queryKey:["/api/trades/clients"]})}}),w=m.filter(i=>!["archived","prospect"].includes(i.status)),h=s.trim().toLowerCase(),x=w.filter(i=>{const a=`${i.firstName??""} ${i.lastName??""} ${i.siteAddress??""}`.toLowerCase();return!h||a.includes(h)}),A=`active client${w.length!==1?"s":""}`,B=i=>{const a=C.filter(l=>l.clientProfileId===i&&l.status!=="voided").sort((l,E)=>new Date(E.createdAt??E.dueAt).getTime()-new Date(l.createdAt??l.dueAt).getTime());if(a.length===0)return;const v=a.find(l=>l.status==="dispatch_failed");if(v)return v;const j=a.find(l=>R(l));if(j)return j;const D=a.find(l=>K.includes(l.status));return D||a[0]};return e.jsx("div",{style:{background:t.white,minHeight:"100svh",display:"flex",justifyContent:"center"},children:e.jsxs("div",{style:{width:"100%",maxWidth:430,minHeight:"100svh",background:t.sheet,paddingBottom:128,fontFamily:"'Outfit', system-ui, sans-serif",overflow:"hidden"},children:[e.jsx("style",{children:Z}),e.jsxs("section",{className:"cdir-hero",children:[e.jsx("div",{className:"pt-bounce cdir-hero-count",style:{"--pt-d":"0ms"},children:w.length}),e.jsx("div",{className:"pt-bounce cdir-hero-label",style:{"--pt-d":"60ms"},children:A})]}),e.jsxs("main",{className:"cdir-body",children:[e.jsx("button",{type:"button",className:"cdir-add",onPointerDown:I,onClick:()=>n(!0),"aria-label":"Add client",children:e.jsx("svg",{width:26,height:26,viewBox:"0 0 24 24",fill:"none",stroke:t.ink,strokeWidth:"2.6",strokeLinecap:"round",children:e.jsx("path",{d:"M12 5v14M5 12h14"})})}),e.jsxs("div",{className:"pt-bounce cdir-search-row",style:{"--pt-d":"140ms"},children:[e.jsxs("label",{className:"cdir-search",children:[e.jsx("input",{value:s,onChange:i=>o(i.target.value),placeholder:"search clients or site"}),s&&e.jsx("button",{type:"button",onClick:()=>o(""),"aria-label":"Clear search",children:e.jsx("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:t.mute,strokeWidth:"2.2",strokeLinecap:"round",children:e.jsx("path",{d:"M6 6l12 12M18 6 6 18"})})})]}),e.jsx("button",{type:"button",onClick:()=>r("/trades"),"aria-label":"Go to trades dashboard",className:"cdir-grid-btn",children:e.jsxs("svg",{width:17,height:17,viewBox:"0 0 20 20",fill:t.sky,children:[e.jsx("rect",{x:"1",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"1",y:"12",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"12",width:"7",height:"7",rx:"1.5"})]})})]}),e.jsx("div",{className:"cdir-list",children:y?e.jsx("div",{className:"pt-bounce cdir-empty",style:{"--pt-d":"190ms"},children:"loading clients..."}):x.length===0?e.jsx("div",{className:"pt-bounce cdir-empty",style:{"--pt-d":"190ms"},children:s?`no clients match "${s}"`:"no clients yet - tap + to add your first"}):x.map((i,a)=>e.jsx("div",{className:"pt-bounce",style:{"--pt-d":`${190+Math.min(a,12)*45}ms`},children:e.jsx(U,{client:i,nextInvoice:B(i.id),onClick:()=>r(`/trades/clients/${i.id}`)})},i.id))}),e.jsxs("div",{className:"pt-bounce cdir-archived",style:{"--pt-d":`${190+(Math.min(x.length,12)+1)*45}ms`},children:[e.jsx("button",{type:"button",onClick:()=>u(i=>!i),children:p?"hide archived":"show archived"}),p&&(S.length===0?e.jsx("div",{className:"cdir-archived-empty",children:"no archived clients"}):e.jsx("div",{className:"cdir-archived-list",children:S.map(i=>e.jsxs("div",{className:"cdir-archive-row",children:[e.jsxs("div",{children:[e.jsxs("strong",{children:[i.firstName," ",i.lastName]}),e.jsx("span",{children:i.siteAddress})]}),e.jsx("button",{type:"button",onClick:()=>z.mutate(i.id),disabled:z.isPending,children:"restore"})]},i.id))}))]})]}),c&&e.jsx(X,{onClose:()=>{n(!1),d(null)},onSave:i=>{d(null),N.mutate(i)},saving:N.isPending,saveError:k})]})})}const Z=`
.cdir-hero {
  position: relative;
  height: 265px;
  background: ${t.ink};
  color: ${t.sky};
  padding: 78px 34px 0;
  box-sizing: border-box;
}
.cdir-hero-count {
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 100px;
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.cdir-hero-label {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.cdir-add {
  position: absolute;
  left: 50%;
  top: -34px;
  width: 68px;
  height: 68px;
  transform: translateX(-50%);
  opacity: 0;
  animation: cdirAddPop 0.52s cubic-bezier(0.34, 1.56, 0.64, 1) 90ms both;
  border: none;
  border-radius: 999px;
  background: ${t.sky};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(4,13,109,0.16);
  -webkit-tap-highlight-color: transparent;
}
.cdir-add::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: 0 0 0 0 rgba(88,171,255,0);
}
.cdir-add.cdir-pulse::after {
  animation: cdirAddRing 0.48s ease-out;
}
@keyframes cdirAddPop {
  0%   { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.86); }
  55%  { opacity: 1; transform: translateX(-50%) translateY(-7px) scale(1.045); }
  74%  { transform: translateX(-50%) translateY(3px) scale(0.983); }
  88%  { transform: translateX(-50%) translateY(-1.5px) scale(1.007); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes cdirAddRing {
  0% { box-shadow: 0 0 0 0 rgba(88,171,255,0.48); }
  100% { box-shadow: 0 0 0 10px rgba(88,171,255,0); }
}
.cdir-body {
  position: relative;
  background: ${t.body};
  margin-top: -28px;
  border-radius: 28px 28px 0 0;
  min-height: calc(100svh - 237px);
  padding: 50px 13px 0;
  box-sizing: border-box;
}
.cdir-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  align-items: center;
}
.cdir-search {
  height: 40px;
  border-radius: 999px;
  background: ${t.gray};
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 18px;
  box-sizing: border-box;
}
.cdir-search input {
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: ${t.ink};
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0;
}
.cdir-search input::placeholder { color: rgba(4,13,109,0.4); }
.cdir-search button {
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  cursor: pointer;
}
.cdir-grid-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 13px;
  background: ${t.ink};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cdir-list {
  display: flex;
  flex-direction: column;
  padding-top: 12px;
}
.cdir-row {
  width: 100%;
  border: none;
  background: transparent;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding: 15px 4px;
  box-sizing: border-box;
  color: ${t.ink};
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cdir-row:active { transform: scale(0.99); opacity: 0.75; }
.cdir-avatar {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: transparent;
  border: 1.5px solid ${t.sky};
  color: ${t.ink};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  box-sizing: border-box;
}
.cdir-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cdir-name {
  color: ${t.ink};
  font-weight: 700;
  font-size: 15px;
  line-height: 1.15;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-address {
  color: rgba(4,13,109,0.75);
  font-weight: 500;
  font-size: 13.5px;
  line-height: 1.2;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-money {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 76px;
  color: ${t.ink};
  justify-self: end;
}
.cdir-money span {
  font-size: 17px;
  line-height: 1;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.cdir-money small {
  font-size: 10px;
  line-height: 1.35;
  color: rgba(4,13,109,0.75);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}
.cdir-money small.overdue { color: ${t.red}; font-weight: 700; }
.cdir-empty {
  padding: 34px 18px;
  color: rgba(4,13,109,0.55);
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}
.cdir-archived {
  padding: 23px 2px 0;
}
.cdir-archived > button {
  border: none;
  background: transparent;
  color: rgba(4,13,109,0.48);
  font-family: inherit;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0;
}
.cdir-archived-empty {
  padding: 14px 0;
  color: rgba(4,13,109,0.48);
  font-size: 13px;
  font-weight: 650;
}
.cdir-archived-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.cdir-archive-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: ${t.gray};
}
.cdir-archive-row div {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cdir-archive-row strong {
  color: ${t.ink};
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-archive-row span {
  color: rgba(4,13,109,0.55);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cdir-archive-row button {
  border: none;
  border-radius: 11px;
  background: ${t.ink};
  color: ${t.white};
  padding: 8px 13px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}
@media (max-width: 350px) {
  .cdir-body { padding-left: 10px; padding-right: 10px; }
  .cdir-row { grid-template-columns: 42px minmax(0, 1fr) auto; gap: 10px; padding-left: 2px; padding-right: 2px; }
  .cdir-avatar { width: 42px; height: 42px; }
  .cdir-money { min-width: 68px; }
  .cdir-money span { font-size: 15px; }
}
`;export{oe as default};
