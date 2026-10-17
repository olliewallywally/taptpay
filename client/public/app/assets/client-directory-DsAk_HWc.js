import{a as x,j as e}from"./vendor-react-AMNEYxzq.js";import{j as u,B as $,U as q}from"./index-y55qo8Rp.js";import{u as I,a as E,b as R}from"./vendor-query-CB8yqtYV.js";import{u as M}from"./vendor-router-D9HrRinU.js";import{a as B,t as D}from"./trades-api-B2V8FQHL.js";import{X as P}from"./vendor-lucide-BbBrUuSV.js";import"./helpers-DruY0qtP.js";import"./vendor-radix-BJaByn9f.js";import"./vendor-motion-D7I7mHCg.js";import"./vendor-forms-CYD6JJw5.js";const t={ink:$.INK,sky:$.ACCENT,white:"#FFFFFF",gray:"#D9D7D7",sheet:$.OFFW,body:"#E8E8E8",mute:"#8C8C8C",red:"#C71A2A"},Y={firstName:"",lastName:"",email:"",phone:"",siteAddress:"",preferredChannel:"email",notes:""};function _(n){return"$"+(n/100).toLocaleString("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2})}function G(n){const a=n.currentTarget;a.classList.remove("cdir-pulse"),a.offsetWidth,a.classList.add("cdir-pulse")}function w({label:n,value:a,onChange:o,placeholder:h,required:r,type:d="text"}){const m=x.useId();return e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("label",{htmlFor:m,style:{display:"block",fontSize:11,fontWeight:600,color:t.ink,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:[n,r?" *":""]}),e.jsx("input",{id:m,type:d,value:a,onChange:g=>o(g.target.value),placeholder:h,style:{width:"100%",padding:"14px 16px",borderRadius:14,background:t.gray,border:"none",outline:"none",color:t.ink,fontSize:"max(15px, var(--field-floor, 0px))",fontWeight:500,boxSizing:"border-box",fontFamily:"inherit"}})]})}function X({label:n,value:a,onChange:o,placeholder:h}){const r=x.useId();return e.jsxs("div",{style:{marginBottom:14},children:[e.jsx("label",{htmlFor:r,style:{display:"block",fontSize:11,fontWeight:600,color:t.ink,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:n}),e.jsx("textarea",{id:r,value:a,onChange:d=>o(d.target.value),placeholder:h,style:{width:"100%",minHeight:88,resize:"vertical",padding:"14px 16px",borderRadius:14,background:t.gray,border:"none",outline:"none",color:t.ink,fontSize:"max(15px, var(--field-floor, 0px))",fontWeight:500,boxSizing:"border-box",fontFamily:"inherit"}})]})}function H({onClose:n,onSave:a,saving:o,saveError:h}){const[r,d]=x.useState(Y),[m,g]=x.useState(!1),c=l=>v=>{d(F=>({...F,[l]:v}))},b=r.preferredChannel==="email"?!!r.email.trim():!!r.phone.trim(),f=!!r.firstName.trim()&&!!r.lastName.trim()&&!!r.siteAddress.trim()&&b,y=()=>{g(!0),setTimeout(n,320)},N=q(!0,()=>{o||y()}),j=()=>{!f||o||a(r)};return e.jsxs("div",{style:{position:"fixed",inset:0,zIndex:100},children:[e.jsx("style",{children:`
        @keyframes atSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes atSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes atFdIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atFdOut { from { opacity: 1; } to { opacity: 0; } }
      `}),e.jsx("div",{onClick:y,style:{position:"absolute",inset:0,background:"rgba(4,13,109,0.55)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",animation:m?"atFdOut 0.28s ease both":"atFdIn 0.28s ease both"}}),e.jsx("div",{style:{position:"absolute",bottom:0,left:0,right:0,display:"flex",justifyContent:"center"},children:e.jsxs("div",{ref:N,role:"dialog","aria-modal":"true","aria-label":"Add client",tabIndex:-1,style:{width:"100%",maxWidth:"var(--phone-shell-max)",background:t.sheet,borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto",animation:m?"atSlideDown 0.32s cubic-bezier(0.4,0,0.2,1) both":"atSlideUp 0.38s cubic-bezier(0.16,1,0.3,1) both"},children:[e.jsx("div",{style:{display:"flex",justifyContent:"center",padding:"14px 0 2px"},children:e.jsx("div",{style:{width:36,height:4,borderRadius:2,background:"rgba(0,0,0,0.1)"}})}),e.jsxs("div",{style:{padding:"12px 24px 52px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24},children:[e.jsx("span",{style:{fontWeight:700,fontSize:20,color:t.ink,letterSpacing:"-0.3px"},children:"add client"}),e.jsx("button",{onClick:y,"aria-label":"Close add client sheet",style:{width:32,height:32,borderRadius:999,background:t.gray,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx(P,{size:15,color:t.ink,strokeWidth:2.4})})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"},children:[e.jsx(w,{label:"first name",value:r.firstName,onChange:c("firstName"),required:!0}),e.jsx(w,{label:"last name",value:r.lastName,onChange:c("lastName"),required:!0})]}),e.jsx(w,{label:"site address",value:r.siteAddress,onChange:c("siteAddress"),required:!0}),e.jsx(w,{label:"email",value:r.email,onChange:c("email"),type:"email"}),e.jsx(w,{label:"phone",value:r.phone,onChange:c("phone"),type:"tel"}),e.jsxs("div",{style:{marginBottom:24},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:t.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8},children:"send invoice via"}),e.jsx("div",{style:{display:"flex",gap:8},children:["email","whatsapp","sms"].map(l=>e.jsx("button",{"aria-pressed":r.preferredChannel===l,onClick:()=>d(v=>({...v,preferredChannel:l})),style:{flex:1,padding:"13px 0",borderRadius:14,border:"none",background:r.preferredChannel===l?t.ink:t.gray,color:r.preferredChannel===l?t.white:t.ink,fontWeight:600,fontSize:12.5,cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.04em",transition:"background 0.18s, color 0.18s"},children:l},l))}),!b&&e.jsxs("div",{style:{marginTop:8,fontSize:12,color:t.red,fontWeight:500},children:["add ",r.preferredChannel==="email"?"an email address":"a phone number"," above to send via ",r.preferredChannel]})]}),e.jsx(X,{label:"notes",value:r.notes,onChange:c("notes"),placeholder:"job access, parking, gate code"}),h&&e.jsx("div",{style:{marginBottom:16,padding:"12px 16px",borderRadius:14,background:"rgba(255,59,78,0.07)",border:"1px solid rgba(255,59,78,0.18)"},children:e.jsx("p",{role:"alert",style:{color:t.red,fontSize:13,fontWeight:500,margin:0},children:h})}),e.jsx("button",{onClick:j,disabled:!f||o,style:{width:"100%",padding:"18px 0",borderRadius:999,background:f&&!o?t.ink:t.gray,color:f&&!o?t.white:t.mute,fontWeight:700,fontSize:16,border:"none",cursor:f&&!o?"pointer":"default",transition:"background 0.2s, color 0.2s"},children:o?"adding…":"add client"})]})]})})]})}function K(n){return`${n.firstName?.[0]??""}${n.lastName?.[0]??""}`.toUpperCase()||"?"}const U=["pending_dispatch","dispatched","viewed","deposit_paid","balance_due","dispatch_failed"];function L(n){return n?n.status==="overdue"?!0:!!n.dueAt&&new Date(n.dueAt).getTime()<Date.now()&&!["paid","paid_external","voided"].includes(n.status):!1}function Q(n){return n?.dueAt?new Date(n.dueAt).toLocaleDateString("en-NZ",{day:"2-digit",month:"2-digit"}):""}function Z({client:n,nextInvoice:a,onClick:o}){const h=`${n.firstName??""} ${n.lastName??""}`.trim()||"client",r=L(a),d=a&&["paid","paid_external"].includes(a.status),m=r?"overdue":d?"paid":"next invoice";return e.jsxs("button",{type:"button",className:"cdir-row",onClick:o,children:[e.jsx("span",{className:"cdir-avatar",children:K(n)}),e.jsxs("span",{className:"cdir-copy",children:[e.jsx("span",{className:"cdir-name",children:h}),e.jsx("span",{className:"cdir-address",children:n.siteAddress||"no site address"})]}),e.jsxs("span",{className:"cdir-money",children:[e.jsx("span",{children:a?_(a.amountCents??0):"—"}),a?e.jsxs("small",{className:r?"overdue":"",children:[m,e.jsx("br",{}),Q(a)]}):e.jsx("small",{children:"no invoice"})]})]})}function le(){const[,n]=M(),[a,o]=x.useState(""),[h,r]=x.useState(!1),[d,m]=x.useState(!1),[g,c]=x.useState(null),b=I(),{data:f=[],isLoading:y}=E({queryKey:[u("GET /api/trades/clients")],queryFn:()=>D(u("GET /api/trades/clients")).then(i=>i.ok?i.json():[]),staleTime:6e4,retry:!1}),{data:N=[]}=E({queryKey:[u("GET /api/trades/invoices")],queryFn:()=>D(u("GET /api/trades/invoices")).then(i=>i.ok?i.json():[]),staleTime:3e4,retry:!1}),{data:j=[]}=E({queryKey:[u("GET /api/trades/clients"),"archived"],queryFn:()=>D(`${u("GET /api/trades/clients")}?includeArchived=true`).then(i=>i.ok?i.json():[]),select:i=>i.filter(s=>s.status==="archived"),enabled:d,staleTime:3e4,retry:!1}),z=R({mutationFn:async i=>{const s=await fetch(u("POST /api/trades/clients"),{method:"POST",headers:{"Content-Type":"application/json",...B()},body:JSON.stringify(i)});if(!s.ok){const C=await s.json().then(S=>S.message).catch(()=>`Error ${s.status}`);throw new Error(C)}return s.json()},onSuccess:()=>{b.invalidateQueries({queryKey:[u("GET /api/trades/clients")]}),c(null),r(!1)},onError:i=>{c(i instanceof Error?i.message:"Failed to add client. The backend may not be connected yet.")}}),T=R({mutationFn:async i=>{const s=await fetch(u("POST /api/trades/clients/:id/unarchive",{id:i}),{method:"POST",headers:B()});if(!s.ok)throw new Error("Failed to restore");return s.json()},onSuccess:()=>{b.invalidateQueries({queryKey:[u("GET /api/trades/clients")]})}}),k=f.filter(i=>!["archived","prospect"].includes(i.status)),A=a.trim().toLowerCase(),l=k.filter(i=>{const s=`${i.firstName??""} ${i.lastName??""} ${i.siteAddress??""}`.toLowerCase();return!A||s.includes(A)}),v=`active client${k.length!==1?"s":""}`,F=i=>{const s=N.filter(p=>p.clientProfileId===i&&p.status!=="voided").sort((p,O)=>new Date(O.createdAt??O.dueAt).getTime()-new Date(p.createdAt??p.dueAt).getTime());if(s.length===0)return;const C=s.find(p=>p.status==="dispatch_failed");if(C)return C;const S=s.find(p=>L(p));if(S)return S;const W=s.find(p=>U.includes(p.status));return W||s[0]};return e.jsx("div",{style:{background:t.white,minHeight:"100svh",display:"flex",justifyContent:"center"},children:e.jsxs("div",{className:"directory-page",style:{width:"100%",maxWidth:"var(--phone-shell-max)",minHeight:"100svh",background:t.sheet,paddingBottom:128,fontFamily:"'Outfit', system-ui, sans-serif",overflow:"hidden"},children:[e.jsx("style",{children:J}),e.jsxs("section",{className:"cdir-hero",children:[e.jsx("div",{className:"pt-bounce cdir-hero-count",style:{"--pt-d":"0ms"},children:k.length}),e.jsx("div",{className:"pt-bounce cdir-hero-label",style:{"--pt-d":"60ms"},children:v})]}),e.jsxs("main",{className:"cdir-body",tabIndex:0,"aria-label":"Client directory",children:[e.jsx("button",{type:"button",className:"cdir-add",onPointerDown:G,onClick:()=>r(!0),"aria-label":"Add client",children:e.jsx("svg",{width:26,height:26,viewBox:"0 0 24 24",fill:"none",stroke:t.ink,strokeWidth:"2.6",strokeLinecap:"round",children:e.jsx("path",{d:"M12 5v14M5 12h14"})})}),e.jsxs("div",{className:"pt-bounce cdir-search-row",style:{"--pt-d":"140ms"},children:[e.jsxs("label",{className:"cdir-search",children:[e.jsx("input",{value:a,onChange:i=>o(i.target.value),placeholder:"search clients or site"}),a&&e.jsx("button",{type:"button",onClick:()=>o(""),"aria-label":"Clear search",children:e.jsx("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:t.mute,strokeWidth:"2.2",strokeLinecap:"round",children:e.jsx("path",{d:"M6 6l12 12M18 6 6 18"})})})]}),e.jsx("button",{type:"button",onClick:()=>n("/trades"),"aria-label":"Go to trades dashboard",className:"cdir-grid-btn",children:e.jsxs("svg",{width:17,height:17,viewBox:"0 0 20 20",fill:t.sky,children:[e.jsx("rect",{x:"1",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"1",y:"12",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"12",width:"7",height:"7",rx:"1.5"})]})})]}),e.jsx("div",{className:"cdir-list",children:y?e.jsx("div",{className:"pt-bounce cdir-empty",style:{"--pt-d":"190ms"},children:"loading clients..."}):l.length===0?e.jsx("div",{className:"pt-bounce cdir-empty",style:{"--pt-d":"190ms"},children:a?`no clients match "${a}"`:"no clients yet - tap + to add your first"}):l.map((i,s)=>e.jsx("div",{className:"pt-bounce",style:{"--pt-d":`${190+Math.min(s,12)*45}ms`},children:e.jsx(Z,{client:i,nextInvoice:F(i.id),onClick:()=>n(`/trades/clients/${i.id}`)})},i.id))}),e.jsxs("div",{className:"pt-bounce cdir-archived",style:{"--pt-d":`${190+(Math.min(l.length,12)+1)*45}ms`},children:[e.jsx("button",{type:"button",onClick:()=>m(i=>!i),children:d?"hide archived":"show archived"}),d&&(j.length===0?e.jsx("div",{className:"cdir-archived-empty",children:"no archived clients"}):e.jsx("div",{className:"cdir-archived-list",children:j.map(i=>e.jsxs("div",{className:"cdir-archive-row",children:[e.jsxs("div",{children:[e.jsxs("strong",{children:[i.firstName," ",i.lastName]}),e.jsx("span",{children:i.siteAddress})]}),e.jsx("button",{type:"button",onClick:()=>T.mutate(i.id),disabled:T.isPending,children:"restore"})]},i.id))}))]})]}),h&&e.jsx(H,{onClose:()=>{r(!1),c(null)},onSave:i=>{c(null),z.mutate(i)},saving:z.isPending,saveError:g})]})})}const J=`
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
  color: rgba(4,13,109,0.7);
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
  color: rgba(4,13,109,0.7);
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
`;export{le as default};
