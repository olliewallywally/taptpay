import{r as h,j as e}from"./vendor-react-BjxQnpua.js";import{b as M,c as L,u as W}from"./vendor-query-BOVVqqRq.js";import{u as $}from"./vendor-router-zIkAIo_Y.js";import{s as O,g as P,h as E}from"./index-DYpVr4S_.js";import{p as _}from"./property-api-BhlONgUE.js";import{u as Y,a as q}from"./property-data-BOjr5x3W.js";import"./helpers-ChQ818WN.js";import"./vendor-radix-BeYeHBLa.js";import"./vendor-lucide-CG1xpyR4.js";import"./vendor-motion-DTfMEuUs.js";import"./vendor-forms-CThSqFLs.js";const r={navy:"#040D6D",sky:"#58AAFD",btn:"#58AAFD",white:"#FFFFFF",gray:"#D9D7D7",sheet:"#F4F4F4",row:"#F7F7F7",mute:"#8C8C8C"};function I(i){return"$"+(i/100).toLocaleString("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2})}function B(){const i=localStorage.getItem("authToken");return i?{Authorization:`Bearer ${i}`}:{}}function U(i){const s=i.currentTarget;s.classList.remove("tdir-pulse"),s.offsetWidth,s.classList.add("tdir-pulse")}function y({label:i,value:s,onChange:l,placeholder:x,required:a,type:g="text"}){return e.jsxs("div",{style:{marginBottom:14},children:[e.jsxs("div",{style:{fontSize:11,fontWeight:600,color:r.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},children:[i,a?" *":""]}),e.jsx("input",{type:g,value:s,onChange:b=>l(b.target.value),placeholder:x,style:{width:"100%",padding:"14px 16px",borderRadius:14,background:r.gray,border:"none",outline:"none",color:r.navy,fontSize:15,fontWeight:500,boxSizing:"border-box",fontFamily:"inherit"}})]})}function X({onClose:i,onSave:s,saving:l,saveError:x}){const[a,g]=h.useState({firstName:"",lastName:"",email:"",phone:"",propertyAddress:"",preferredChannel:"email"}),[b,N]=h.useState([]),[p,j]=h.useState({name:"",email:"",phone:""}),[k,D]=h.useState(!1),[F,A]=h.useState(!1),f=n=>o=>g(c=>({...c,[n]:o})),v=n=>o=>j(c=>({...c,[n]:o})),C=a.preferredChannel==="email"?!!a.email.trim():!!a.phone.trim(),m=a.firstName.trim()&&a.lastName.trim()&&a.propertyAddress.trim()&&C,w=()=>{A(!0),setTimeout(i,320)},S=()=>{p.name.trim()&&(N(n=>[...n,{...p}]),j({name:"",email:"",phone:""}),D(!1))},z=()=>{if(!m||l)return;const n=b.length>0?b.map(o=>{const c=[o.email,o.phone].filter(Boolean).join(", ");return c?`${o.name} (${c})`:o.name}).join(`
`):"";s({...a,coTenantsText:n})};return e.jsxs("div",{style:{position:"fixed",inset:0,zIndex:100},children:[e.jsx("style",{children:`
        @keyframes atSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes atSlideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes atFdIn      { from { opacity: 0; } to { opacity: 1; } }
        @keyframes atFdOut     { from { opacity: 1; } to { opacity: 0; } }
      `}),e.jsx("div",{onClick:w,style:{position:"absolute",inset:0,background:"rgba(4,13,109,0.55)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",animation:F?"atFdOut 0.28s ease both":"atFdIn 0.28s ease both"}}),e.jsx("div",{style:{position:"absolute",bottom:0,left:0,right:0,display:"flex",justifyContent:"center"},children:e.jsxs("div",{style:{width:"100%",maxWidth:430,background:"#F4F4F4",borderRadius:"28px 28px 0 0",maxHeight:"92vh",overflowY:"auto",animation:F?"atSlideDown 0.32s cubic-bezier(0.4,0,0.2,1) both":"atSlideUp 0.38s cubic-bezier(0.16,1,0.3,1) both"},children:[e.jsx("div",{style:{display:"flex",justifyContent:"center",padding:"14px 0 2px"},children:e.jsx("div",{style:{width:36,height:4,borderRadius:2,background:"rgba(0,0,0,0.1)"}})}),e.jsxs("div",{style:{padding:"12px 24px 52px"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24},children:[e.jsx("span",{style:{fontWeight:700,fontSize:20,color:r.navy,letterSpacing:"-0.3px"},children:"add tenant"}),e.jsx("button",{onClick:w,style:{width:32,height:32,borderRadius:999,background:r.gray,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},children:e.jsx("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:r.navy,strokeWidth:"2.4",strokeLinecap:"round",children:e.jsx("path",{d:"M5 5l14 14M19 5L5 19"})})})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"},children:[e.jsx(y,{label:"first name",value:a.firstName,onChange:f("firstName"),required:!0}),e.jsx(y,{label:"last name",value:a.lastName,onChange:f("lastName"),required:!0})]}),e.jsx(y,{label:"property address",value:a.propertyAddress,onChange:f("propertyAddress"),required:!0}),e.jsx(y,{label:"email",value:a.email,onChange:f("email"),type:"email"}),e.jsx(y,{label:"phone",value:a.phone,onChange:f("phone"),type:"tel"}),e.jsxs("div",{style:{marginBottom:24},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:r.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8},children:"send rent link via"}),e.jsx("div",{style:{display:"flex",gap:8},children:["email","whatsapp","sms"].map(n=>e.jsx("button",{onClick:()=>g(o=>({...o,preferredChannel:n})),style:{flex:1,padding:"13px 0",borderRadius:14,border:"none",background:a.preferredChannel===n?r.navy:r.gray,color:a.preferredChannel===n?r.white:r.navy,fontWeight:600,fontSize:12.5,cursor:"pointer",textTransform:"uppercase",letterSpacing:"0.04em",transition:"background 0.18s, color 0.18s"},children:n},n))}),!C&&e.jsxs("div",{style:{marginTop:8,fontSize:12,color:"#C71A2A",fontWeight:500},children:["add ",a.preferredChannel==="email"?"an email address":"a phone number"," above to send via ",a.preferredChannel]})]}),e.jsxs("div",{style:{marginBottom:24},children:[e.jsx("div",{style:{fontSize:11,fontWeight:600,color:r.sky,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10},children:"subtenants"}),b.map((n,o)=>e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",marginBottom:8,borderRadius:14,background:r.gray},children:[e.jsx("div",{style:{width:30,height:30,borderRadius:999,background:r.navy,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:11,fontWeight:700,color:r.sky},children:n.name.split(" ").map(c=>c[0]).join("").slice(0,2).toUpperCase()}),e.jsxs("div",{style:{flex:1,minWidth:0},children:[e.jsx("div",{style:{fontWeight:600,fontSize:14,color:r.navy},children:n.name}),(n.email||n.phone)&&e.jsx("div",{style:{fontWeight:400,fontSize:12,color:r.mute,marginTop:1},children:[n.email,n.phone].filter(Boolean).join(" · ")})]}),e.jsx("button",{onClick:()=>N(c=>c.filter((G,R)=>R!==o)),style:{width:26,height:26,borderRadius:999,background:"rgba(4,13,109,0.08)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},children:e.jsx("svg",{width:12,height:12,viewBox:"0 0 24 24",fill:"none",stroke:r.navy,strokeWidth:"2.4",strokeLinecap:"round",children:e.jsx("path",{d:"M5 5l14 14M19 5L5 19"})})})]},o)),e.jsxs("button",{onClick:()=>D(n=>!n),style:{width:"100%",padding:"13px 0",borderRadius:14,border:`1.5px dashed ${k?r.sky:"rgba(4,13,109,0.18)"}`,background:k?"rgba(88,171,255,0.06)":"transparent",color:r.navy,fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.22s ease"},children:[e.jsx("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:r.sky,strokeWidth:"2.4",strokeLinecap:"round",children:e.jsx("path",{d:"M12 5v14M5 12h14"})}),e.jsx("span",{style:{color:r.navy},children:"add subtenant"})]}),e.jsx("div",{style:{overflow:"hidden",maxHeight:k?"320px":"0px",transition:"max-height 0.38s cubic-bezier(0.16,1,0.3,1)"},children:e.jsxs("div",{style:{paddingTop:14,display:"flex",flexDirection:"column",gap:10},children:[e.jsx(y,{label:"name",value:p.name,onChange:v("name"),required:!0}),e.jsx(y,{label:"email",value:p.email,onChange:v("email"),type:"email"}),e.jsx(y,{label:"phone",value:p.phone,onChange:v("phone"),type:"tel"}),e.jsx("button",{onClick:S,disabled:!p.name.trim(),style:{padding:"13px 0",borderRadius:14,background:p.name.trim()?r.navy:r.gray,color:p.name.trim()?r.white:r.mute,fontWeight:600,fontSize:14,border:"none",cursor:p.name.trim()?"pointer":"default",transition:"background 0.18s"},children:"confirm subtenant"})]})})]}),x&&e.jsx("div",{style:{marginBottom:16,padding:"12px 16px",borderRadius:14,background:"rgba(255,59,78,0.07)",border:"1px solid rgba(255,59,78,0.18)"},children:e.jsx("p",{style:{color:"#C71A2A",fontSize:13,fontWeight:500,margin:0},children:x})}),e.jsx("button",{onClick:z,disabled:!m||l,style:{width:"100%",padding:"18px 0",borderRadius:999,background:m&&!l?r.navy:r.gray,color:m&&!l?r.white:r.mute,fontWeight:700,fontSize:16,border:"none",cursor:m&&!l?"pointer":"default",transition:"background 0.2s, color 0.2s"},children:l?"adding…":"add tenant"})]})]})})]})}function H(i){var s,l;return`${((s=i.firstName)==null?void 0:s[0])??""}${((l=i.lastName)==null?void 0:l[0])??""}`.toUpperCase()||"?"}function Q(i){return i!=null&&i.dueAt?new Date(i.dueAt).toLocaleDateString("en-NZ",{day:"2-digit",month:"2-digit"}):""}function K({tenant:i,nextInvoice:s,onClick:l}){const x=`${i.firstName} ${i.lastName}`.trim(),a=(s==null?void 0:s.status)==="overdue";return e.jsxs("button",{type:"button",className:"tdir-row",onClick:l,children:[e.jsx("span",{className:"tdir-avatar",children:H(i)}),e.jsxs("span",{className:"tdir-copy",children:[e.jsx("span",{className:"tdir-name",children:x}),e.jsx("span",{className:"tdir-address",children:i.propertyAddress})]}),e.jsxs("span",{className:"tdir-money",children:[e.jsx("span",{children:s?I(s.amountCents):"—"}),s?e.jsxs("small",{className:a?"overdue":"",children:[a?"overdue":"next payment",e.jsx("br",{}),Q(s)]}):e.jsx("small",{children:"no invoice"})]})]})}function le(){const[,i]=$(),[s,l]=h.useState(""),[x,a]=h.useState(!1),[g,b]=h.useState(!1),[N,p]=h.useState(null),j=M(),k=h.useRef(null);h.useLayoutEffect(()=>{E()},[]);const{data:D=[],isLoading:F}=Y(),{data:A=[]}=q(),{data:f=[]}=L({queryKey:["/api/property/tenants","archived"],queryFn:()=>_("/api/property/tenants?includeArchived=true").then(t=>t.ok?t.json():[]),select:t=>t.filter(d=>d.status==="archived"),enabled:g,staleTime:3e4,retry:!1}),v=W({mutationFn:async t=>{const d=await fetch(`/api/property/tenants/${t}/unarchive`,{method:"POST",headers:B()});if(!d.ok)throw new Error("Failed to restore");return d.json()},onSuccess:()=>{j.invalidateQueries({queryKey:["/api/property/tenants"]})}}),C=W({mutationFn:async t=>{const d=await fetch("/api/property/tenants",{method:"POST",headers:{"Content-Type":"application/json",...B()},body:JSON.stringify(t)});if(!d.ok){const u=await d.json().then(n=>n.message).catch(()=>`Error ${d.status}`);throw new Error(u)}return d.json()},onSuccess:()=>{j.invalidateQueries({queryKey:["/api/property/tenants"]}),p(null),a(!1)},onError:t=>{p((t==null?void 0:t.message)||"Failed to add tenant. The backend may not be connected yet.")}}),m=D.filter(t=>t.status!=="archived"),w=s.trim().toLowerCase(),S=m.filter(t=>!w||`${t.firstName} ${t.lastName}`.toLowerCase().includes(w)||t.propertyAddress.toLowerCase().includes(w)),z=`active tenant${m.length!==1?"s":""}`,T=t=>{const d=A.filter(o=>o.tenantProfileId===t&&o.status!=="voided");if(d.length===0)return;const u=d.find(o=>o.status==="overdue");if(u)return u;const n=d.find(o=>["dispatched","pending_dispatch","dispatch_failed"].includes(o.status));return n||[...d].sort((o,c)=>new Date(c.createdAt).getTime()-new Date(o.createdAt).getTime())[0]};return e.jsx("div",{style:{background:r.white,minHeight:"100svh",display:"flex",justifyContent:"center"},children:e.jsxs("div",{style:{width:"100%",maxWidth:430,minHeight:"100svh",background:r.sheet,paddingBottom:128,fontFamily:"'Outfit', system-ui, sans-serif",overflow:"hidden"},children:[e.jsx("style",{children:Z}),e.jsxs("section",{ref:k,className:"pt-hero tdir-hero",children:[e.jsx("div",{className:"pt-bounce tdir-hero-count",style:{"--pt-d":"0ms"},children:m.length}),e.jsx("div",{className:"pt-bounce tdir-hero-label",style:{"--pt-d":"60ms"},children:z})]}),e.jsxs("main",{className:"tdir-body",children:[e.jsx("button",{type:"button",className:"tdir-add",onPointerDown:U,onClick:()=>a(!0),"aria-label":"Add tenant",children:e.jsx("svg",{width:26,height:26,viewBox:"0 0 24 24",fill:"none",stroke:r.navy,strokeWidth:"2.6",strokeLinecap:"round",children:e.jsx("path",{d:"M12 5v14M5 12h14"})})}),e.jsxs("div",{className:"pt-bounce tdir-search-row",style:{"--pt-d":"140ms"},children:[e.jsxs("label",{className:"tdir-search",children:[e.jsx("input",{value:s,onChange:t=>l(t.target.value),placeholder:"search tenants or address"}),s&&e.jsx("button",{type:"button",onClick:()=>l(""),"aria-label":"Clear search",children:e.jsx("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:r.mute,strokeWidth:"2.2",strokeLinecap:"round",children:e.jsx("path",{d:"M6 6l12 12M18 6 6 18"})})})]}),e.jsx("button",{type:"button",onClick:()=>O(()=>i("/property"),{expectHero:!1}),"aria-label":"Go to property dashboard",className:"tdir-grid-btn",children:e.jsxs("svg",{width:17,height:17,viewBox:"0 0 20 20",fill:r.sky,children:[e.jsx("rect",{x:"1",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"1",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"1",y:"12",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"12",y:"12",width:"7",height:"7",rx:"1.5"})]})})]}),e.jsx("div",{className:"tdir-list",children:F?e.jsx("div",{className:"pt-bounce tdir-empty",style:{"--pt-d":"190ms"},children:"loading tenants..."}):S.length===0?e.jsx("div",{className:"pt-bounce tdir-empty",style:{"--pt-d":"190ms"},children:s?`no tenants match "${s}"`:"no tenants yet - tap + to add your first"}):S.map((t,d)=>e.jsx("div",{className:"pt-bounce",style:{"--pt-d":`${190+Math.min(d,12)*45}ms`},children:e.jsx(K,{tenant:t,nextInvoice:T(t.id),onClick:()=>{const u=T(t.id);P({id:t.id,firstName:t.firstName,lastName:t.lastName,propertyAddress:t.propertyAddress,preferredChannel:t.preferredChannel,invoiceStatus:u==null?void 0:u.status},()=>i(`/property/tenants/${t.id}`))}})},t.id))}),e.jsxs("div",{className:"pt-bounce tdir-archived",style:{"--pt-d":`${190+(Math.min(S.length,12)+1)*45}ms`},children:[e.jsx("button",{type:"button",onClick:()=>b(t=>!t),children:g?"hide archived":"show archived"}),g&&(f.length===0?e.jsx("div",{className:"tdir-archived-empty",children:"no archived tenants"}):e.jsx("div",{className:"tdir-archived-list",children:f.map(t=>e.jsxs("div",{className:"tdir-archive-row",children:[e.jsxs("div",{children:[e.jsxs("strong",{children:[t.firstName," ",t.lastName]}),e.jsx("span",{children:t.propertyAddress})]}),e.jsx("button",{type:"button",onClick:()=>v.mutate(t.id),disabled:v.isPending,children:"restore"})]},t.id))}))]})]}),x&&e.jsx(X,{onClose:()=>{a(!1),p(null)},onSave:t=>{p(null),C.mutate(t)},saving:C.isPending,saveError:N})]})})}const Z=`
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
  color: rgba(4,13,109,0.48);
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
  color: rgba(4,13,109,0.48);
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
`;export{le as default};
