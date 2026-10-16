import{r as c,j as e}from"./vendor-react-Bym1zpZ6.js";import{j as k,ac as P,ad as _,ae as I,i as Y,k as q,af as U}from"./index-BImdaJ_D.js";import{u as H,a as X,b as M}from"./vendor-query-DOnMPzUI.js";import{u as G}from"./vendor-router-D1z0FhFb.js";import{p as Q}from"./property-api-DUtBUHmx.js";import{u as K,a as Z}from"./property-data-8E779atP.js";import{A as J}from"./AnimatedScrollList-lC-7JWDx.js";import"./helpers-2bMVvZI7.js";import"./vendor-radix-DRNifoMd.js";import"./vendor-lucide-CuEUB03e.js";import"./vendor-motion-Cxs569HU.js";import"./vendor-forms-BvU1B9Fz.js";import"./response-data-DLWISmZ_.js";const r={navy:"#040D6D",sky:"#58AAFD",btn:"#58AAFD",white:"#FFFFFF",gray:"#D9D7D7",sheet:"#F4F4F4",row:"#F7F7F7",mute:"#8C8C8C"};function V(s){return"$"+(s/100).toLocaleString("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2})}function O(){return q()}function ee(s){const a=s.currentTarget;a.classList.remove("tdir-pulse"),a.offsetWidth,a.classList.add("tdir-pulse")}function b({label:s,value:a,onChange:d,placeholder:u,required:i,type:x="text"}){const f=c.useId();return e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("label",{htmlFor:f,style:{display:"block",fontSize:11,fontWeight:600,color:r.navy,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:[s,i?" *":""]}),e.jsx("input",{id:f,type:x,value:a,onChange:w=>d(w.target.value),placeholder:u,style:{width:"100%",padding:"14px 16px",borderRadius:14,background:r.gray,border:"none",outline:"none",color:r.navy,fontSize:"max(15px, var(--field-floor, 0px))",fontWeight:500,boxSizing:"border-box",fontFamily:"inherit"}})]})}function te({onClose:s,onSave:a,saving:d,saveError:u}){const[i,x]=c.useState({firstName:"",lastName:"",email:"",phone:"",propertyAddress:"",preferredChannel:"email"}),[f,w]=c.useState([]),[p,C]=c.useState({name:"",email:"",phone:""}),[g,A]=c.useState(!1),[z,W]=c.useState(!1),y=n=>l=>x(h=>({...h,[n]:l})),j=n=>l=>C(h=>({...h,[n]:l})),S=i.preferredChannel==="email"?!!i.email.trim():!!i.phone.trim(),m=i.firstName.trim()&&i.lastName.trim()&&i.propertyAddress.trim()&&S,v=()=>{W(!0),setTimeout(s,320)},N=I(!0,()=>{d||v()}),R=()=>{p.name.trim()&&(w(n=>[...n,{...p}]),C({name:"",email:"",phone:""}),A(!1))},T=()=>{if(!m||d)return;const n=f.length>0?f.map(l=>{const h=[l.email,l.phone].filter(Boolean).join(", ");return h?`${l.name} (${h})`:l.name}).join(`
`):"";a({...i,coTenantsText:n})};return e.jsxs("div",{style:{position:"fixed",inset:0,zIndex:100},children:[e.jsx("style",{children:`
        @keyframes atSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes atSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes atFdIn      { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atFdOut     { from { opacity: 1; } to { opacity: 0; } }
      `}),e.jsx("div",{onClick:v,style:{position:"absolute",inset:0,background:"rgba(4,13,109,0.55)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",animation:z?"atFdOut 0.28s ease both":"atFdIn 0.28s ease both"}}),e.jsx("div",{style:{position:"absolute",bottom:0,left:0,right:0,display:"flex",justifyContent:"center"},children:e.jsxs("div",{ref:N,role:"dialog","aria-modal":"true","aria-label":"Add tenant",tabIndex:-1,style:{width:"100%",maxWidth:"var(--phone-shell-max)",background:"#F4F4F4",borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto",animation:z?"atSlideDown 0.32s cubic-bezier(0.4,0,0.2,1) both":"atSlideUp 0.38s cubic-bezier(0.16,1,0.3,1) both"},children:[e.jsx("div",{style:{display:"flex",justifyContent:"center",padding:"14px 0 2px"},children:e.jsx("div",{style:{width:36,height:4,borderRadius:2,background:"rgba(0,0,0,0.1)"}})}),e.jsxs("div",{style:{padding:"12px 24px 52px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24},children:[e.jsx("span",{style:{fontWeight:700,fontSize:20,color:r.navy,letterSpacing:"-0.3px"},children:"add tenant"}),e.jsx("button",{"aria-label":"Close add tenant",onClick:v,style:{width:32,height:32,borderRadius:999,background:r.gray,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:r.navy,strokeWidth:"2.4",strokeLinecap:"round",children:e.jsx("path",{d:"M5 5l14 14M19 5L5 19"})})})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"},children:[e.jsx(b,{label:"first name",value:i.firstName,onChange:y("firstName"),required:!0}),e.jsx(b,{label:"last name",value:i.lastName,onChange:y("lastName"),required:!0})]}),e.jsx(b,{label:"property address",value:i.propertyAddress,onChange:y("propertyAddress"),required:!0}),e.jsx(b,{label:"email",value:i.email,onChange:y("email"),type:"email"}),e.jsx(b,{label:"phone",value:i.phone,onChange:y("phone"),type:"tel"}),e.jsxs("div",{style:{marginBottom:24},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:r.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8},children:"send rent link via"}),e.jsx("div",{style:{display:"flex",gap:8},children:["email","whatsapp","sms"].map(n=>e.jsx("button",{"aria-pressed":i.preferredChannel===n,onClick:()=>x(l=>({...l,preferredChannel:n})),style:{flex:1,padding:"13px 0",borderRadius:14,border:"none",background:i.preferredChannel===n?r.navy:r.gray,color:i.preferredChannel===n?r.white:r.navy,fontWeight:600,fontSize:12.5,cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.04em",transition:"background 0.18s, color 0.18s"},children:n},n))}),!S&&e.jsxs("div",{style:{marginTop:8,fontSize:12,color:"#C71A2A",fontWeight:500},children:["add ",i.preferredChannel==="email"?"an email address":"a phone number"," above to send via ",i.preferredChannel]})]}),e.jsxs("div",{style:{marginBottom:24},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:r.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10},children:"subtenants"}),f.map((n,l)=>e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",marginBottom:8,borderRadius:14,background:r.gray},children:[e.jsx("div",{style:{width:30,height:30,borderRadius:999,background:r.navy,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:11,fontWeight:700,color:r.sky},children:n.name.split(" ").map(h=>h[0]).join("").slice(0,2).toUpperCase()}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsx("div",{style:{fontWeight:600,fontSize:14,color:r.navy},children:n.name}),(n.email||n.phone)&&e.jsx("div",{style:{fontWeight:400,fontSize:12,color:r.mute,marginTop:1},children:[n.email,n.phone].filter(Boolean).join(" · ")})]}),e.jsx("button",{"aria-label":`Remove subtenant ${l+1}`,onClick:h=>{var L;const B=(L=h.currentTarget.closest('[role="dialog"]'))==null?void 0:L.querySelector("button[aria-expanded]");w($=>$.filter((se,E)=>E!==l)),B==null||B.focus()},style:{width:26,height:26,borderRadius:999,background:"rgba(4,13,109,0.08)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},children:e.jsx("svg",{width:12,height:12,viewBox:"0 0 24 24",fill:"none",stroke:r.navy,strokeWidth:"2.4",strokeLinecap:"round",children:e.jsx("path",{d:"M5 5l14 14M19 5L5 19"})})})]},l)),e.jsxs("button",{onClick:()=>A(n=>!n),"aria-expanded":g,style:{width:"100%",padding:"13px 0",borderRadius:14,border:`1.5px dashed ${g?r.sky:"rgba(4,13,109,0.18)"}`,background:g?"rgba(88,171,255,0.06)":"transparent",color:r.navy,fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.22s ease"},children:[e.jsx("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:r.sky,strokeWidth:"2.4",strokeLinecap:"round",children:e.jsx("path",{d:"M12 5v14M5 12h14"})}),e.jsx("span",{style:{color:r.navy},children:"add subtenant"})]}),e.jsx("div",{...Y(!g),"aria-hidden":!g,style:{overflow:"hidden",maxHeight:g?"320px":"0px",transition:"max-height 0.38s cubic-bezier(0.16,1,0.3,1)"},children:e.jsxs("div",{style:{paddingTop:14,display:"flex",flexDirection:"column",gap:10},children:[e.jsx(b,{label:"name",value:p.name,onChange:j("name"),required:!0}),e.jsx(b,{label:"email",value:p.email,onChange:j("email"),type:"email"}),e.jsx(b,{label:"phone",value:p.phone,onChange:j("phone"),type:"tel"}),e.jsx("button",{onClick:R,disabled:!p.name.trim(),style:{padding:"13px 0",borderRadius:14,background:p.name.trim()?r.navy:r.gray,color:p.name.trim()?r.white:r.mute,fontWeight:600,fontSize:14,border:"none",cursor:p.name.trim()?"pointer":"default",transition:"background 0.18s"},children:"confirm subtenant"})]})})]}),u&&e.jsx("div",{style:{marginBottom:16,padding:"12px 16px",borderRadius:14,background:"rgba(255,59,78,0.07)",border:"1px solid rgba(255,59,78,0.18)"},children:e.jsx("p",{role:"alert",style:{color:"#C71A2A",fontSize:13,fontWeight:500,margin:0},children:u})}),e.jsx("button",{onClick:T,disabled:!m||d,style:{width:"100%",padding:"18px 0",borderRadius:999,background:m&&!d?r.navy:r.gray,color:m&&!d?r.white:r.mute,fontWeight:700,fontSize:16,border:"none",cursor:m&&!d?"pointer":"default",transition:"background 0.2s, color 0.2s"},children:d?"adding…":"add tenant"})]})]})})]})}function re(s){var a,d;return`${((a=s.firstName)==null?void 0:a[0])??""}${((d=s.lastName)==null?void 0:d[0])??""}`.toUpperCase()||"?"}function ne(s){return s!=null&&s.dueAt?new Date(s.dueAt).toLocaleDateString("en-NZ",{day:"2-digit",month:"2-digit"}):""}function ie({tenant:s,nextInvoice:a,onClick:d}){const u=`${s.firstName} ${s.lastName}`.trim(),i=(a==null?void 0:a.status)==="overdue";return e.jsxs(J,{type:"button",className:"tdir-row",onClick:d,children:[e.jsx("span",{className:"tdir-avatar",children:re(s)}),e.jsxs("span",{className:"tdir-copy",children:[e.jsx("span",{className:"tdir-name",children:u}),e.jsx("span",{className:"tdir-address",children:s.propertyAddress})]}),e.jsxs("span",{className:"tdir-money",children:[e.jsx("span",{children:a?V(a.amountCents):"—"}),a?e.jsxs("small",{className:i?"overdue":"",children:[i?"overdue":"next payment",e.jsx("br",{}),ne(a)]}):e.jsx("small",{children:"no invoice"})]})]})}function ve(){const[,s]=G(),[a,d]=c.useState(""),[u,i]=c.useState(!1),[x,f]=c.useState(!1),[w,p]=c.useState(null),C=H(),g=c.useRef(null);c.useLayoutEffect(()=>{U()},[]);const{data:A=[],isLoading:z}=K(),{data:W=[]}=Z(),{data:y=[]}=X({queryKey:[k("GET /api/property/tenants"),"archived"],queryFn:()=>Q(`${k("GET /api/property/tenants")}?includeArchived=true`).then(t=>t.ok?t.json():[]),select:t=>t.filter(o=>o.status==="archived"),enabled:x,staleTime:3e4,retry:!1}),j=M({mutationFn:async t=>{const o=await fetch(k("POST /api/property/tenants/:id/unarchive",{id:t}),{method:"POST",headers:O()});if(!o.ok)throw new Error("Failed to restore");return o.json()},onSuccess:()=>{C.invalidateQueries({queryKey:[k("GET /api/property/tenants")]})}}),S=M({mutationFn:async t=>{const o=await fetch(k("POST /api/property/tenants"),{method:"POST",headers:{"Content-Type":"application/json",...O()},body:JSON.stringify(t)});if(!o.ok){const D=await o.json().then(F=>F.message).catch(()=>`Error ${o.status}`);throw new Error(D)}return o.json()},onSuccess:()=>{C.invalidateQueries({queryKey:[k("GET /api/property/tenants")]}),p(null),i(!1)},onError:t=>{p((t==null?void 0:t.message)||"Failed to add tenant. The backend may not be connected yet.")}}),m=A.filter(t=>t.status!=="archived"),v=a.trim().toLowerCase(),N=m.filter(t=>!v||`${t.firstName} ${t.lastName}`.toLowerCase().includes(v)||t.propertyAddress.toLowerCase().includes(v)),R=`active tenant${m.length!==1?"s":""}`,T=t=>{const o=W.filter(n=>n.tenantProfileId===t&&n.status!=="voided");if(o.length===0)return;const D=o.find(n=>n.status==="overdue");if(D)return D;const F=o.find(n=>["dispatched","pending_dispatch","dispatch_failed"].includes(n.status));return F||[...o].sort((n,l)=>new Date(l.createdAt).getTime()-new Date(n.createdAt).getTime())[0]};return e.jsx("div",{style:{background:r.white,minHeight:"100svh",display:"flex",justifyContent:"center"},children:e.jsxs("div",{className:"directory-page",style:{width:"100%",maxWidth:"var(--phone-shell-max)",minHeight:"100svh",background:r.sheet,paddingBottom:128,fontFamily:"'Outfit', system-ui, sans-serif",overflow:"hidden"},children:[e.jsx("style",{children:ae}),e.jsxs("section",{ref:g,className:"pt-hero tdir-hero",children:[e.jsx("div",{className:"pt-bounce tdir-hero-count",style:{"--pt-d":"0ms"},children:m.length}),e.jsx("div",{className:"pt-bounce tdir-hero-label",style:{"--pt-d":"60ms"},children:R})]}),e.jsxs("main",{className:"tdir-body",tabIndex:0,"aria-label":"Tenant directory",children:[e.jsx("button",{type:"button",className:"tdir-add",onPointerDown:ee,onClick:()=>i(!0),"aria-label":"Add tenant",children:e.jsx("svg",{width:26,height:26,viewBox:"0 0 24 24",fill:"none",stroke:r.navy,strokeWidth:"2.6",strokeLinecap:"round",children:e.jsx("path",{d:"M12 5v14M5 12h14"})})}),e.jsxs("div",{className:"pt-bounce tdir-search-row",style:{"--pt-d":"140ms"},children:[e.jsxs("label",{className:"tdir-search",children:[e.jsx("input",{value:a,onChange:t=>d(t.target.value),placeholder:"search tenants or address"}),a&&e.jsx("button",{type:"button",onClick:()=>d(""),"aria-label":"Clear search",children:e.jsx("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:r.mute,strokeWidth:"2.2",strokeLinecap:"round",children:e.jsx("path",{d:"M6 6l12 12M18 6 6 18"})})})]}),e.jsx("button",{type:"button",onClick:()=>P(()=>s("/property"),{expectHero:!1}),"aria-label":"Go to property dashboard",className:"tdir-grid-btn",children:e.jsxs("svg",{width:17,height:17,viewBox:"0 0 20 20",fill:r.sky,children:[e.jsx("rect",{x:"1",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"1",y:"12",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"12",width:"7",height:"7",rx:"1.5"})]})})]}),e.jsx("div",{className:"tdir-list",children:z?e.jsx("div",{className:"pt-bounce tdir-empty",style:{"--pt-d":"190ms"},children:"loading tenants..."}):N.length===0?e.jsx("div",{className:"pt-bounce tdir-empty",style:{"--pt-d":"190ms"},children:a?`no tenants match "${a}"`:"no tenants yet - tap + to add your first"}):N.map(t=>e.jsx(ie,{tenant:t,nextInvoice:T(t.id),onClick:()=>{const o=T(t.id);_({id:t.id,firstName:t.firstName,lastName:t.lastName,propertyAddress:t.propertyAddress,preferredChannel:t.preferredChannel,invoiceStatus:o==null?void 0:o.status},()=>s(`/property/tenants/${t.id}`))}},t.id))}),e.jsxs("div",{className:"pt-bounce tdir-archived",style:{"--pt-d":`${190+(Math.min(N.length,12)+1)*45}ms`},children:[e.jsx("button",{type:"button",onClick:()=>f(t=>!t),children:x?"hide archived":"show archived"}),x&&(y.length===0?e.jsx("div",{className:"tdir-archived-empty",children:"no archived tenants"}):e.jsx("div",{className:"tdir-archived-list",children:y.map(t=>e.jsxs("div",{className:"tdir-archive-row",children:[e.jsxs("div",{children:[e.jsxs("strong",{children:[t.firstName," ",t.lastName]}),e.jsx("span",{children:t.propertyAddress})]}),e.jsx("button",{type:"button",onClick:()=>j.mutate(t.id),disabled:j.isPending,children:"restore"})]},t.id))}))]})]}),u&&e.jsx(te,{onClose:()=>{i(!1),p(null)},onSave:t=>{p(null),S.mutate(t)},saving:S.isPending,saveError:w})]})})}const ae=`
.tdir-hero {
  position: relative;
  height: 265px;
  background: #040D6D;
  color: #58AAFD;
  padding: 78px 34px 0;
  box-sizing: border-box;
}
.tdir-hero-count {
  /* Matches the terminal's .tp-amount metrics so heroes read as one type system */
  font-family: 'Outfit', system-ui, sans-serif;
  font-size: 100px;
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.tdir-hero-label {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.tdir-add {
  position: absolute;
  left: 50%;
  top: -34px;
  width: 68px;
  height: 68px;
  transform: translateX(-50%);
  /* Own bounce keyframes — the generic pt-bounce would wipe the centering translateX */
  opacity: 0;
  animation: tdirAddPop 0.52s cubic-bezier(0.34, 1.56, 0.64, 1) 90ms both;
  border: none;
  border-radius: 999px;
  background: #58AAFD;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(4,13,109,0.16);
  -webkit-tap-highlight-color: transparent;
}
.tdir-add::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: 0 0 0 0 rgba(88,170,253,0);
}
.tdir-add.tdir-pulse::after {
  animation: tdirAddRing 0.48s ease-out;
}
@keyframes tdirAddPop {
  0%   { opacity: 0; transform: translateX(-50%) translateY(30px) scale(0.86); }
  55%  { opacity: 1; transform: translateX(-50%) translateY(-7px) scale(1.045); }
  74%  { transform: translateX(-50%) translateY(3px) scale(0.983); }
  88%  { transform: translateX(-50%) translateY(-1.5px) scale(1.007); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes tdirAddRing {
  0% { box-shadow: 0 0 0 0 rgba(88,170,253,0.48); }
  100% { box-shadow: 0 0 0 10px rgba(88,170,253,0); }
}
.tdir-body {
  position: relative;
  background: #E8E8E8;
  margin-top: -28px;
  border-radius: 28px 28px 0 0;
  min-height: calc(100svh - 237px);
  padding: 50px 13px 0;
  box-sizing: border-box;
}
.tdir-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  gap: 8px;
  align-items: center;
}
.tdir-search {
  height: 40px;
  border-radius: 999px;
  background: #D9D7D7;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 18px;
  box-sizing: border-box;
}
.tdir-search input {
  min-width: 0;
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: #040D6D;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0;
}
.tdir-search input::placeholder { color: rgba(4,13,109,0.4); }
.tdir-search button {
  border: none;
  background: transparent;
  padding: 0;
  display: flex;
  cursor: pointer;
}
.tdir-grid-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 13px;
  background: #040D6D;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tdir-list {
  display: flex;
  flex-direction: column;
  padding-top: 12px;
}
.tdir-row {
  width: 100%;
  border: none;
  background: transparent;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding: 15px 4px;
  box-sizing: border-box;
  color: #040D6D;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tdir-row:active { transform: scale(0.99); opacity: 0.75; }
.tdir-avatar {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  background: transparent;
  border: 1.5px solid #58AAFD;
  color: #040D6D;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  box-sizing: border-box;
}
.tdir-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tdir-name {
  color: #040D6D;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.15;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tdir-address {
  color: rgba(4,13,109,0.75);
  font-weight: 500;
  font-size: 13.5px;
  line-height: 1.2;
  text-transform: lowercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tdir-money {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 76px;
  color: #040D6D;
  justify-self: end;
}
.tdir-money span {
  font-size: 17px;
  line-height: 1;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tdir-money small {
  font-size: 10px;
  line-height: 1.35;
  color: rgba(4,13,109,0.75);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
}
.tdir-money small.overdue { color: #C71A2A; font-weight: 700; }
.tdir-empty {
  padding: 34px 18px;
  color: rgba(4,13,109,0.55);
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}
.tdir-archived {
  padding: 23px 2px 0;
}
.tdir-archived > button {
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
.tdir-archived-empty {
  padding: 14px 0;
  color: rgba(4,13,109,0.7);
  font-size: 13px;
  font-weight: 650;
}
.tdir-archived-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}
.tdir-archive-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: #D9D7D7;
}
.tdir-archive-row div {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tdir-archive-row strong {
  color: #040D6D;
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tdir-archive-row span {
  color: rgba(4,13,109,0.55);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tdir-archive-row button {
  border: none;
  border-radius: 11px;
  background: #040D6D;
  color: #FFFFFF;
  padding: 8px 13px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}
@media (max-width: 350px) {
  .tdir-body { padding-left: 10px; padding-right: 10px; }
  .tdir-row { grid-template-columns: 42px minmax(0, 1fr) auto; gap: 10px; padding-left: 2px; padding-right: 2px; }
  .tdir-avatar { width: 42px; height: 42px; }
  .tdir-money { min-width: 68px; }
  .tdir-money span { font-size: 15px; }
}
`;export{ve as default};
