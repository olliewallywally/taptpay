import{a as i,j as e}from"./vendor-react-AMNEYxzq.js";import{u as wt,a as te,b as re}from"./vendor-query-CB8yqtYV.js";import{g as kt}from"./auth-8wqcUwYN.js";import{u as vt,d as jt,M as m,f as ae,g as se,j as ie,h as Nt}from"./index-y55qo8Rp.js";import{D as St}from"./DesktopPageScaffold-8cdDqTMK.js";import{f as zt,D as Ct,a as Et,d as Ft,b as $t}from"./desktop-keypad-D9A_uoQA.js";import{D as Qe}from"./DesktopLoadFailure-CfNoFKCP.js";import{a as Tt}from"./response-data-DLWISmZ_.js";import"./helpers-DruY0qtP.js";import"./vendor-router-D9HrRinU.js";import"./vendor-radix-BJaByn9f.js";import"./vendor-lucide-BbBrUuSV.js";import"./vendor-motion-D7I7mHCg.js";import"./vendor-forms-CYD6JJw5.js";import"./DesktopChrome-DDYqOPGr.js";const ke="#5E9EFF",n="#7FB2FF",Lt="#4A86F0",j="#66A9FF",T="#F4F6FF",O="#000F3F",We="#12162E",Mt="#1D48C8",ne="#C6CFE2",It="#35D07F",ve="#F0656C",Pt="#F0A34E",je="#9DBCFF",Ve="Maximum 10 tapt stones allowed per merchant";function we(l){const s=l instanceof Error?l.message:String(l??""),c=s.match(/^(\d{3}):\s*/),p=c?Number(c[1]):null,b=c?s.slice(c[0].length):s,x=b.indexOf("{");if(x>=0)try{const g=JSON.parse(b.slice(x));if(typeof g?.message=="string"&&g.message.trim())return{status:p,message:g.message.trim()}}catch{}return{status:p,message:b.trim()}}const L=l=>parseFloat(String(l??"0")||"0")||0,M=l=>"$"+l.toLocaleString("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2}),Bt=l=>"$"+Math.round(l).toLocaleString("en-NZ");function Kt(l){const s=String(l??"").trim().split(/\s+/).filter(c=>/^[a-z0-9]/i.test(c));return s.length===0?"–":s.length===1?s[0].slice(0,2).toUpperCase():(s[0][0]+s[1][0]).toUpperCase()}function Dt(l){switch(l){case"completed":return{bucket:"paid",label:"paid",dot:It};case"failed":case"cancelled":return{bucket:"failed",label:l==="cancelled"?"cancelled":"failed",dot:ve};case"refunded":return{bucket:"refunded",label:"refunded",dot:je};case"partially_refunded":return{bucket:"refunded",label:"partly refunded",dot:je};default:return{bucket:"awaiting",label:"awaiting payment",dot:Pt}}}const Rt=["all","awaiting payment","paid","failed"],qt={all:null,"awaiting payment":"awaiting",paid:"paid",failed:"failed"},At=["5","10","15","20"],Ut=[2,3,4,6];function ir(l){const s=kt(),c=wt(),{toast:p}=vt(),[b,x]=i.useState("send"),[g,oe]=i.useState(0),[Ne,I]=i.useState(""),[P,le]=i.useState(""),[z,de]=i.useState({kind:"no-board"}),[h,ce]=i.useState(null),[u,B]=i.useState(null),pe=i.useRef(!1),[K,N]=i.useState(null),[_,Se]=i.useState(!1),[he,Ye]=i.useState(2),[ue,Ge]=i.useState(""),[C,Ze]=i.useState("all"),[ze,Q]=i.useState(null),[He,Ce]=i.useState(null),[D,Ee]=i.useState(!1),Fe=i.useRef(null),$e=i.useRef(null),Te=i.useRef({}),[W,Le]=i.useState(!1),[me,V]=i.useState(!1),[Xe,Y]=i.useState(null),[Je,G]=i.useState(!1),[Z,S]=i.useState(""),H=async t=>{const r=await Nt(t);if(!r.ok)throw new Error(t);return Tt(t,await r.json())},et=te({queryKey:[m,s,"profile"],queryFn:()=>H(ie("GET /api/merchants/:id/profile",{id:s})),enabled:!!s}),w=te({queryKey:[m,s,"transactions"],queryFn:()=>H(ie("GET /api/merchants/:id/transactions",{id:s})),refetchInterval:5e3,enabled:!!s}),E=te({queryKey:[m,s,"stock-items"],queryFn:()=>H(ie("GET /api/merchants/:merchantId/stock-items",{merchantId:s})),enabled:!!s}),f=te({queryKey:[m,s,"tapt-stones"],queryFn:()=>H(ie("GET /api/merchants/:id/tapt-stones",{id:s})),enabled:!!s}),R=w.isError&&w.data===void 0,tt=E.isError&&E.data===void 0,rt=()=>{w.refetch()},at=()=>{E.refetch()},Me=R?"Available once your sales load":void 0,X=w.data??[],Ie=E.data??[],F=f.data??[],st=et.data,y=re({mutationFn:async t=>(await ae(...se("POST /api/transactions"),{merchantId:s,itemName:t.item,price:t.price,status:"pending",splitEnabled:t.splitEnabled,...t.destination.kind==="no-board"?{linkMode:"per_payment"}:{selectedStoneId:t.destination.boardId,linkMode:"legacy"}})).json(),onMutate:()=>{ce(null),B(null),Q(null)},onSuccess:(t,r)=>{c.invalidateQueries({queryKey:[m,s,"transactions"]}),c.invalidateQueries({queryKey:[m,s,"active-transaction"]});const a=typeof t?.paymentUrl=="string"?t.paymentUrl.trim():"",o=typeof t?.qrCodeUrl=="string"?t.qrCodeUrl.trim():"";if(!a||!o){const d="The sale was created, but its private share link was not returned. Start a new sale to try again.";B(d),x("share"),p({title:"Payment link unavailable",description:d,variant:"destructive"})}else ce({item:r.item,amount:L(r.price),paymentUrl:a,qrCodeUrl:o,destination:r.destination}),x("share");le(""),oe(0),Se(!1)},onError:t=>{if(jt(t))return;const a=we(t).message||"Please try again";B(a),p({title:"Couldn't start the sale",description:a,variant:"destructive"})},onSettled:()=>{pe.current=!1}}),q=re({mutationFn:async t=>{const r=t?.trim();return(await ae(...se("POST /api/merchants/:id/tapt-stones",{id:s}),r?{name:r}:{})).json()},onMutate:()=>N(null),onSuccess:t=>{if(typeof t?.id!="number"){N("New board created, but its details could not be loaded"),f.refetch();return}G(!1),S(""),Le(!0),V(!1),c.setQueryData([m,s,"tapt-stones"],(r=[])=>[...r.filter(a=>a.id!==t.id),t].sort((a,o)=>a.stoneNumber-o.stoneNumber)),de({kind:"board",boardId:t.id}),N(null),c.invalidateQueries({queryKey:[m,s,"tapt-stones"]}),p({title:"New board created",description:`${t.name} selected`})},onError:t=>{const r=we(t),a=r.message||"Failed to create a new board";N(a),r.status===409&&f.refetch(),p({title:a===Ve?"Board limit reached":"Couldn't create board",description:a,variant:"destructive"})}}),it=re({mutationFn:async({id:t,name:r})=>(await ae(...se("PUT /api/merchants/:merchantId/tapt-stones/:stoneId",{merchantId:s,stoneId:t}),{name:r.trim()})).json(),onMutate:()=>N(null),onSuccess:(t,{id:r,name:a})=>{c.setQueryData([m,s,"tapt-stones"],(o=[])=>o.map(d=>d.id===r?{...d,...t,name:t?.name??a.trim()}:d)),Y(null),S(""),c.invalidateQueries({queryKey:[m,s,"tapt-stones"]})},onError:t=>{const r=we(t).message||"Couldn't rename that board";N(r),p({title:"Couldn't rename board",description:r,variant:"destructive"})}}),xe=re({mutationFn:async t=>(await ae(...se("POST /api/transactions/:id/cancel",{id:t}),{})).json(),onSuccess:()=>{c.invalidateQueries({queryKey:[m,s,"transactions"]}),c.invalidateQueries({queryKey:[m,s,"active-transaction"]}),p({title:"Transaction cancelled"}),Ce(null)},onError:()=>p({title:"Failed to cancel",variant:"destructive"})}),{revenueToday:nt,txnsToday:ot,pctVsYesterday:ge}=i.useMemo(()=>{const t=new Date;t.setHours(0,0,0,0);const r=new Date(t.getTime()-864e5);let a=0,o=0,d=0;for(const v of X){const ee=new Date(v.createdAt);ee>=t?(d+=1,v.status==="completed"&&(a+=L(v.price))):ee>=r&&v.status==="completed"&&(o+=L(v.price))}return{revenueToday:a,txnsToday:d,pctVsYesterday:o>0?Math.round((a-o)/o*100):null}},[X]),Pe=i.useMemo(()=>{const t=ue.trim().toLowerCase(),r=qt[C];return[...X].sort((a,o)=>new Date(o.createdAt).getTime()-new Date(a.createdAt).getTime()).map(a=>({...a,meta:Dt(a.status)})).filter(a=>r===null?!0:a.meta.bucket===r).filter(a=>(a.itemName??"").toLowerCase().includes(t))},[X,ue,C]),lt=he>0?g/he:g,A=z.kind==="board"?F.find(t=>t.id===z.boardId):void 0,be=h?.destination.kind==="board"?h.destination.boardId:null,dt=be==null?void 0:F.find(t=>t.id===be),J=F.length>=10,k=t=>t.name||`board ${t.stoneNumber}`;i.useEffect(()=>{if(!D)return;const t=r=>{r.key==="Escape"&&(r.stopPropagation(),Ee(!1),Fe.current?.focus())};return document.addEventListener("keydown",t),()=>document.removeEventListener("keydown",t)},[D]),i.useEffect(()=>{const t=$e.current;t&&(t.scrollTop=Te.current[C]??0)},[C]);const fe=i.useRef(!1),$=()=>{Y(null),G(!1),S("")},Be=t=>{t.key==="Enter"?(t.preventDefault(),t.currentTarget.blur()):t.key==="Escape"&&(fe.current=!0,t.currentTarget.blur())},Ke=t=>{if(fe.current){fe.current=!1,$();return}t()},ct=()=>{Le(t=>t?(V(!1),$(),de({kind:"no-board"}),N(null),!1):!0)},pt=t=>{de({kind:"board",boardId:t}),V(!1),$()},ht=t=>{G(!1),Y(t.id),S(k(t))},ut=t=>{const r=Z.trim();if(!r){$();return}const a=F.find(o=>o.id===t);if(a&&k(a)===r){$();return}it.mutate({id:t,name:r})},mt=()=>{q.isPending||q.mutate(Z.trim()||void 0)},De=t=>{if(!pe.current){if(g<=0){p({title:"Enter an amount first",variant:"destructive"});return}if(!P.trim()){p({title:"Item name is required",variant:"destructive"});return}if(z.kind==="board"&&!A){const r="That board is no longer available. Choose another destination.";B(r),p({title:"Choose a destination",description:r,variant:"destructive"});return}pe.current=!0,y.mutate({item:P.trim(),price:g.toFixed(2),splitEnabled:t,destination:z})}},ye=()=>{ce(null),B(null),Q(null)},xt=t=>I(r=>Ft(r,t)),Re=()=>{ye(),I(""),x("keypad")},gt=()=>{oe($t(Ne)/100),I(""),x("send")},bt=()=>{I(""),x("send")},ft=t=>{ye(),le(t.name),oe(L(t.cost)),x("send")},qe=t=>{ye(),t==="keypad"?Re():x(t)},Ae=async(t,r)=>{if(t)try{await navigator.clipboard.writeText(t),Q(r),setTimeout(()=>Q(a=>a===r?null:a),1500),p({title:"Link copied",description:"Payment link copied to clipboard"})}catch{p({title:"Copy failed",description:"Unable to copy payment link",variant:"destructive"})}},Ue=(t,r)=>{if(r)if(t==="email"){const a=encodeURIComponent(`Payment Request - ${st?.businessName||"Payment"}`),o=encodeURIComponent(`Please complete your payment using this link: ${r}`);window.open(`mailto:?subject=${a}&body=${o}`,"_blank")}else window.open(`sms:?body=${encodeURIComponent(`Payment link: ${r}`)}`,"_blank")},yt=t=>window.open(t,"_blank"),U=(t,r,a,o)=>{const d=b===t;return e.jsx("button",{type:"button",className:r?"rt-rail-btn rt-rail-big":"rt-rail-btn","aria-label":o,"aria-pressed":d,style:r?void 0:{background:d?j:"transparent"},onClick:()=>t==="share"?x("share"):qe(t),children:e.jsx("svg",{width:r?24:19,height:r?24:19,viewBox:"0 0 24 24",fill:"none",stroke:r||d?O:n,strokeWidth:r?2.4:1.8,strokeLinecap:"round",strokeLinejoin:"round",children:a})})},Oe=(t,r=1)=>({border:t?`${r}px solid transparent`:`${r}px solid rgba(94,158,255,0.5)`,background:t?j:"transparent",color:t?O:n,fontWeight:t?700:600}),_e=y.isPending?"creating private link…":"send payment";return e.jsxs(St,{...l,vertical:"retail",page:"terminal",showScope:!1,children:[e.jsx("style",{children:Ot}),e.jsxs("div",{className:"rt-body",children:[e.jsxs("div",{className:"rt-left dt-cascade",children:[e.jsx("div",{children:e.jsxs("button",{type:"button",className:"rt-scope","aria-label":"my store scope","aria-haspopup":"listbox",children:[e.jsx("span",{children:"my store"}),e.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"m6 9 6 6 6-6"})})]})}),R?e.jsx("div",{className:"rt-hero-row",children:e.jsx(Qe,{tone:"canvas",title:"Sales didn't load",detail:"Your totals stay hidden until they do.",onRetry:rt,retrying:w.isFetching,testId:"retail-terminal-sales-failed"})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"rt-hero-row",children:[e.jsx("span",{className:"rt-hero",children:w.isLoading?"—":Bt(nt)}),ge!==null&&e.jsxs("span",{className:"rt-hero-pill",children:[ge>=0?"+":"",ge,"%"]})]}),e.jsx("span",{className:"rt-hero-sub",children:"sales revenue today"}),e.jsx("span",{className:"rt-hero rt-hero-dim",children:w.isLoading?"—":ot}),e.jsx("span",{className:"rt-hero-sub rt-hero-sub-dim",children:"transactions today"})]}),e.jsxs("div",{className:"rt-stack","data-tutorial-id":"retail-terminal-live-payments","data-expanded":D?"true":"false",children:[e.jsx("div",{className:"rt-stack-head",children:e.jsxs("button",{type:"button",ref:Fe,className:"rt-stack-toggle","aria-expanded":D,"aria-label":D?"collapse active stack":"expand active stack",onClick:()=>Ee(t=>!t),children:[e.jsx("span",{className:"rt-stack-title",children:"active stack"}),e.jsx("svg",{className:"rt-stack-caret",width:"10",height:"10",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e.jsx("path",{d:"m6 14 6-6 6 6"})})]})}),e.jsxs("div",{className:"rt-stack-search",children:[e.jsxs("svg",{width:"11",height:"11",viewBox:"0 0 24 24",fill:"none",stroke:ke,strokeWidth:"2",strokeLinecap:"round",children:[e.jsx("circle",{cx:"11",cy:"11",r:"6.5"}),e.jsx("path",{d:"m20 20-3.8-3.8"})]}),e.jsx("input",{value:ue,onChange:t=>Ge(t.target.value),placeholder:"search sales","aria-label":"search active stack"})]}),e.jsx("div",{className:"rt-chips",children:Rt.map(t=>e.jsx("button",{type:"button",className:"rt-chip",style:Oe(t===C),onClick:()=>Ze(t),children:t},t))}),e.jsx("div",{className:"rt-rows",tabIndex:0,role:"region","aria-label":"Sales",ref:$e,onScroll:t=>{Te.current[C]=t.currentTarget.scrollTop},children:w.isLoading?e.jsx("div",{className:"rt-empty",children:"loading…"}):R?e.jsx("div",{className:"rt-empty",children:"sales didn't load"}):Pe.length===0?e.jsx("div",{className:"rt-empty",children:"no sales yet"}):Pe.map(t=>{const r=t.meta.bucket==="awaiting",a=He===t.id,d=F.find(ee=>ee.id===t.taptStoneId)?.paymentUrl?.trim()||"",v=e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"rt-avatar",children:Kt(t.itemName||"sale")}),e.jsxs("span",{className:"rt-row-mid",children:[e.jsx("span",{className:"rt-row-name",children:t.itemName||"sale"}),e.jsxs("span",{className:"rt-row-status",children:[e.jsx("span",{className:"rt-dot",style:{background:t.meta.dot}}),t.meta.label,t.isSplit?` · ${t.completedSplits??0}/${t.totalSplits??1} split`:""]})]}),e.jsx("span",{className:"rt-row-amt",children:M(L(t.price))})]});return e.jsxs("div",{className:"rt-row-wrap",children:[r?e.jsx("button",{type:"button",className:"rt-row rt-row-live","aria-expanded":a,onClick:()=>Ce(a?null:t.id),children:v}):e.jsx("div",{className:"rt-row",children:v}),r&&a&&e.jsxs("div",{className:"rt-row-actions",children:[d?e.jsx("button",{type:"button",className:"rt-row-act",onClick:()=>Ae(d,`tx-${t.id}`),children:ze===`tx-${t.id}`?"copied ✓":"copy board link"}):e.jsx("span",{className:"rt-row-link-note",children:"private link available only when the sale starts"}),e.jsx("button",{type:"button",className:"rt-row-act rt-row-act-danger",disabled:xe.isPending,onClick:()=>xe.mutate(t.id),children:xe.isPending?"cancelling…":"cancel"})]})]},t.id)})})]})]}),e.jsx("div",{className:"rt-rail-slot",children:e.jsxs("div",{className:"rt-rail terminal-rail dt-rise","data-tutorial-id":"retail-terminal-tools",style:{"--dt-i":6},children:[U("stock",!1,e.jsxs(e.Fragment,{children:[e.jsx("rect",{x:"4",y:"4",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"13",y:"4",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"4",y:"13",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"13",y:"13",width:"7",height:"7",rx:"1.5"})]}),"stock tiles"),U("split",!1,e.jsxs(e.Fragment,{children:[e.jsx("path",{d:"M12 3v7"}),e.jsx("path",{d:"M12 10l-6 8"}),e.jsx("path",{d:"M12 10l6 8"})]}),"split bill"),U("keypad",!0,e.jsx("path",{d:"M12 5v14M5 12h14"}),"keypad"),U("share",!1,e.jsxs(e.Fragment,{children:[e.jsx("circle",{cx:"18",cy:"5",r:"2.6"}),e.jsx("circle",{cx:"6",cy:"12",r:"2.6"}),e.jsx("circle",{cx:"18",cy:"19",r:"2.6"}),e.jsx("path",{d:"m8.3 10.7 7.4-4.4M8.3 13.3l7.4 4.4"})]}),"share payment link"),U("send",!1,e.jsxs(e.Fragment,{children:[e.jsx("path",{d:"M22 2 11 13"}),e.jsx("path",{d:"M22 2 15 22l-4-9-9-4z"})]}),"compose sale")]})}),e.jsxs("div",{className:"rt-panel terminal-panel dt-rise",style:{"--dt-i":7},children:[b==="send"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-mode terminal-zone-a",children:e.jsxs("div",{className:"rt-amt-row","data-tutorial-id":"retail-terminal-amount",children:[e.jsx("span",{className:"rt-amt",children:M(g)}),e.jsx("button",{type:"button",className:"rt-edit",onClick:Re,children:"edit>"})]})}),e.jsxs("div",{className:"rt-mode terminal-zone-b",children:[e.jsx("div",{className:"rt-destination-label",id:"rt-destination-label",children:"PAYMENT DESTINATION"}),e.jsxs("div",{className:"rt-boards","data-tutorial-id":"retail-terminal-destination",children:[e.jsxs("div",{className:"rt-boards-row",children:[e.jsx("button",{type:"button",className:`rt-wire rt-boards-toggle${W?" on":""}`,"aria-pressed":W,onClick:ct,children:"payment boards"}),W&&e.jsxs("button",{type:"button",className:"rt-wire rt-picker-btn rt-sidepop","aria-haspopup":"true","aria-expanded":me,"aria-controls":"rt-board-list","aria-label":A?`selected board: ${k(A)}`:"select board",onClick:()=>{V(t=>!t),$()},children:[e.jsx("span",{className:"rt-picker-label",children:A?k(A):"select board"}),e.jsx("svg",{className:`rt-caret${me?" open":""}`,width:"11",height:"11",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e.jsx("path",{d:"m6 9 6 6 6-6"})})]})]}),W&&e.jsx("div",{className:`rt-drop${me?" open":""}`,children:e.jsx("div",{className:"rt-drop-inner",children:e.jsxs("div",{id:"rt-board-list",className:"rt-drop-list",role:"radiogroup","aria-label":"payment boards",children:[F.map(t=>e.jsx("div",{className:"rt-drop-row",children:Xe===t.id?e.jsx("input",{className:"rt-drop-input",autoFocus:!0,value:Z,"aria-label":`rename ${k(t)}`,maxLength:60,onChange:r=>S(r.target.value),onBlur:()=>Ke(()=>ut(t.id)),onKeyDown:Be}):e.jsxs(e.Fragment,{children:[e.jsx("button",{type:"button",role:"radio","aria-checked":z.kind==="board"&&z.boardId===t.id,"aria-label":`${k(t)}, board ${t.stoneNumber}`,className:"rt-drop-pick",onClick:()=>pt(t.id),children:k(t)}),e.jsx("button",{type:"button",className:"rt-drop-edit","aria-label":`rename ${k(t)}`,onClick:()=>ht(t),children:e.jsxs("svg",{width:"13",height:"13",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[e.jsx("path",{d:"M12 20h9"}),e.jsx("path",{d:"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"})]})})]})},t.id)),e.jsx("div",{className:"rt-drop-sep",role:"presentation"}),e.jsx("div",{className:"rt-drop-row",children:Je?e.jsx("input",{className:"rt-drop-input",autoFocus:!0,value:Z,placeholder:"board name","aria-label":"new board name",maxLength:60,onChange:t=>S(t.target.value),onBlur:()=>Ke(mt),onKeyDown:Be}):e.jsx("button",{type:"button",className:"rt-drop-create","aria-label":"create new board","aria-busy":q.isPending,"aria-describedby":f.isLoading||f.isError||K||J?"rt-board-status":void 0,disabled:q.isPending||J,onClick:()=>{Y(null),S(""),G(!0)},children:q.isPending?"creating board…":"+ create board"})})]})})}),(f.isLoading||f.isError||K||J)&&e.jsx("span",{id:"rt-board-status",className:f.isError||K?"rt-inline-error":"rt-board-hint",role:f.isError||K?"alert":"status","aria-live":"polite",children:K||(f.isError?"Boards couldn't be loaded. No board remains available.":J?Ve:"loading boards…")})]}),e.jsx("div",{className:"rt-item-name",children:P||"new sale"}),e.jsx("div",{className:"rt-item-hint",children:"tap send to share payment"}),e.jsxs("div",{className:"rt-field",children:[e.jsx("span",{className:"rt-field-label",children:"ITEM NAME"}),e.jsx("input",{className:"rt-name-input",value:P,onChange:t=>le(t.target.value),placeholder:"enter item name or tap a stock tile","aria-label":"item name"})]}),e.jsxs("div",{className:"rt-split-toggle",children:[e.jsxs("span",{className:"rt-split-text",children:[e.jsx("span",{className:"rt-split-cap",children:"split bill"}),e.jsx("span",{className:"rt-split-desc",children:"customer chooses how many ways"})]}),e.jsx("button",{type:"button",className:"rt-switch",role:"switch","aria-checked":_,"aria-label":"split bill",style:{background:_?j:"rgba(94,158,255,0.3)"},onClick:()=>Se(t=>!t),children:e.jsx("span",{className:"rt-knob",style:{transform:_?"translateX(19px)":"translateX(0)"}})})]})]}),e.jsxs("div",{className:"rt-mode terminal-zone-c",children:[e.jsx("button",{type:"button",className:"rt-send-btn","data-tutorial-id":"retail-terminal-send","aria-label":"send payment","aria-busy":y.isPending,"aria-describedby":y.isPending||u?"rt-sale-status":void 0,disabled:y.isPending||R,title:Me,onClick:()=>De(_),children:_e}),(y.isPending||u)&&e.jsx("span",{id:"rt-sale-status",className:`rt-cta-status ${u?"rt-inline-error":"rt-inline-status"}`,role:u?"alert":"status","aria-live":"polite",children:u||"Creating a private payment link…"})]})]}),b==="keypad"&&e.jsxs("div",{className:"rt-mode rt-keypad",children:[e.jsxs("div",{className:"rt-kp-head",children:[e.jsx("button",{type:"button",className:"rt-kp-circle","aria-label":"cancel keypad",onClick:bt,children:e.jsx("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"2.2",strokeLinecap:"round",children:e.jsx("path",{d:"M6 6l12 12M18 6 6 18"})})}),e.jsx("button",{type:"button",className:"rt-kp-circle","aria-label":"confirm amount",onClick:gt,children:e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"m5 12 5 5L19 8"})})})]}),e.jsx("div",{className:"rt-kp-amt",children:zt(Ne)}),e.jsx("div",{className:"rt-kp-quick",children:At.map(t=>e.jsxs("button",{type:"button",className:"rt-kp-quick-btn",onClick:()=>I(t),children:["$",t]},t))}),e.jsx("div",{className:"rt-kp-hint",children:"quick amounts or type it — ✓ starts the sale"}),e.jsx("div",{className:"rt-kp-grid",children:Ct.map(t=>{const r=t!=="."&&t!=="<";return e.jsx(Et,{keyValue:t,className:"rt-kp-key",style:{background:r?j:"transparent",border:r?"none":`1.5px solid ${ke}`,color:r?"#FFFFFF":je,boxShadow:r?"0 14px 22px rgba(0,6,25,0.45)":"none"},onPress:xt},t)})})]}),b==="stock"&&e.jsxs("div",{className:"rt-mode rt-stock",children:[e.jsx("div",{className:"rt-stock-head",children:"Stock — tap a tile to start a sale"}),e.jsx("div",{className:"rt-stock-grid",children:E.isLoading?e.jsx("div",{className:"rt-empty rt-stock-empty",children:"loading…"}):tt?e.jsx("div",{className:"rt-stock-empty",children:e.jsx(Qe,{tone:"canvas",title:"Products didn't load",onRetry:at,retrying:E.isFetching,testId:"retail-terminal-products-failed"})}):Ie.length===0?e.jsx("div",{className:"rt-empty rt-stock-empty",children:"no products yet — add them on the Stock page"}):Ie.map(t=>e.jsxs("button",{type:"button",className:"rt-tile",onClick:()=>ft(t),children:[e.jsx("span",{className:"rt-tile-ico",children:t.emoji||"🏷️"}),e.jsx("span",{className:"rt-tile-name",children:t.name}),e.jsx("span",{className:"rt-tile-price",children:M(L(t.cost))})]},t.id))})]}),b==="split"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-mode terminal-zone-a",children:e.jsxs("div",{className:"rt-amt-row",children:[e.jsx("span",{className:"rt-amt",children:M(g)}),e.jsx("span",{className:"rt-split-lead",children:"split the bill"})]})}),e.jsxs("div",{className:"rt-mode terminal-zone-b",children:[e.jsx("div",{className:"rt-item-name",children:P||"new sale"}),e.jsx("div",{className:"rt-item-hint",children:"customer chooses how many ways to split"}),e.jsxs("div",{className:"rt-split-body",children:[e.jsx("div",{className:"rt-split-chips",children:Ut.map(t=>e.jsxs("button",{type:"button",className:"rt-split-chip",style:Oe(t===he,1.5),onClick:()=>Ye(t),children:[t," ways"]},t))}),e.jsxs("div",{className:"rt-split-each",children:[e.jsx("span",{children:"each pays"}),e.jsx("span",{className:"rt-split-each-amt",children:M(lt)})]}),e.jsx("span",{className:"rt-fee",children:"equal split · customer can enter a different amount on their phone"})]})]}),e.jsxs("div",{className:"rt-mode terminal-zone-c",children:[e.jsx("button",{type:"button",className:"rt-send-btn rt-send-btn-split","aria-label":"send split payment","aria-busy":y.isPending,"aria-describedby":y.isPending||u?"rt-sale-status":void 0,disabled:y.isPending||R,title:Me,onClick:()=>De(!0),children:_e}),(y.isPending||u)&&e.jsx("span",{id:"rt-sale-status",className:`rt-cta-status ${u?"rt-inline-error":"rt-inline-status"}`,role:u?"alert":"status","aria-live":"polite",children:u||"Creating a private split-payment link…"})]})]}),b==="share"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-mode terminal-zone-a",children:e.jsx("div",{className:"rt-amt-row",children:e.jsx("span",{className:"rt-amt",children:M(h?h.amount:g)})})}),e.jsxs("div",{className:"rt-mode terminal-zone-b rt-share",children:[e.jsx("div",{className:"rt-share-head",children:"Share payment link"}),h?e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-share-sub",children:h.item+" — anyone with this private link can pay"}),e.jsxs("div",{className:"rt-share-body","aria-live":"polite",children:[e.jsxs("div",{className:"rt-share-link",children:[e.jsxs("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"}),e.jsx("path",{d:"M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"})]}),e.jsx("span",{className:"rt-share-url",title:h.paymentUrl,children:h.paymentUrl.replace(/^https?:\/\//,"")}),e.jsx("button",{type:"button",className:"rt-share-copy",onClick:()=>Ae(h.paymentUrl,"current-sale"),children:ze==="current-sale"?"copied ✓":"copy link"})]}),e.jsxs("div",{className:"rt-share-actions",children:[e.jsxs("button",{type:"button",className:"rt-share-act",onClick:()=>Ue("email",h.paymentUrl),children:[e.jsxs("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M2 7l10 7 10-7"}),e.jsx("rect",{x:"2",y:"5",width:"20",height:"14",rx:"2"})]}),e.jsx("span",{children:"email"})]}),e.jsxs("button",{type:"button",className:"rt-share-act",onClick:()=>Ue("sms",h.paymentUrl),children:[e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M20 4H4v12h4v4l5-4h7z"})}),e.jsx("span",{children:"sms"})]}),e.jsxs("button",{type:"button",className:"rt-share-act",onClick:()=>yt(h.qrCodeUrl),children:[e.jsxs("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:n,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("rect",{x:"4",y:"4",width:"6",height:"6"}),e.jsx("rect",{x:"14",y:"4",width:"6",height:"6"}),e.jsx("rect",{x:"4",y:"14",width:"6",height:"6"}),e.jsx("path",{d:"M14 14h3v3h-3zM20 14v6h-6"})]}),e.jsx("span",{children:"QR code"})]})]}),e.jsx("div",{className:"rt-current-destination",children:h.destination.kind==="no-board"?"private no-board link":`board ${dt?.stoneNumber??be} link`})]})]}):e.jsx("div",{className:"rt-share-empty-state","aria-live":"polite",children:u?e.jsx("p",{className:"rt-inline-error",role:"alert",children:u}):e.jsx("p",{role:"status",children:"No current sale link. Start a sale to generate a private payment link."})})]}),e.jsx("div",{className:"rt-mode terminal-zone-c",children:e.jsx("button",{type:"button",className:"rt-new-sale",onClick:()=>qe("send"),children:"start new sale"})})]})]})]})]})}const Ot=`
.rt-body { position:relative; display:flex; height:100%; box-sizing:border-box; padding:26px 46px 0 52px; }

/* ── left column ── */
/* Positioned so the stack shell can be pinned against it. The column's top
   edge is canvas y93 and its bottom is canvas y880, which is what every stack
   offset below is measured from. */
.rt-left { position:relative; flex:0 0 420px; display:flex; flex-direction:column; }
.rt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:400; font-size:13.5px; color:${n}; cursor:pointer; transition:background .18s ease; }
.rt-scope:hover { background:rgba(94,158,255,0.08); }
.rt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.rt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${ke}; font-variant-numeric:tabular-nums; }
.rt-hero-pill { margin-top:6px; padding:6px 13px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13px; color:${n}; white-space:nowrap; }
.rt-hero-sub { margin-top:24px; font-weight:300; font-size:17px; color:${Lt}; }
.rt-hero-dim { margin-top:36px; font-size:56px; opacity:0.61; }
.rt-hero-sub-dim { margin-top:12px; opacity:0.61; }

/* ── active stack: a fixed shell, not a bottom-anchored block ──
   margin-top:auto made the header sit at canvas y488 with seven rows and
   y720 with one — a 232px jump on a data change. The shell is now pinned and
   only .rt-rows changes size.

     collapsed   header y488  search y532  chips y566  rows end y856
     expanded    header y93   search y137  chips y171  rows end y856

   Both states share the same internal offsets (0 / 44 / 78 from the shell top),
   so expanding only moves top. 395px = y488 - y93; 24px bottom = y880 - y856. */
.rt-stack { position:absolute; left:0; right:0; top:395px; bottom:24px; display:flex; flex-direction:column; min-height:0; }
.rt-stack[data-expanded="true"] { top:0; }
.rt-stack-toggle { display:inline-flex; align-items:center; gap:6px; padding:0; background:transparent; cursor:pointer; }
.rt-stack-caret { transition:transform var(--m-dur-ui) var(--m-ease-out); }
.rt-stack[data-expanded="true"] .rt-stack-caret { transform:rotate(180deg); }

/* When the stack takes the column, the figures above it step out of the way. */
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-scope,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-row,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-sub,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-dim,
.rt-left:has(.rt-stack[data-expanded="true"]) .rt-hero-sub-dim { visibility:hidden; }
.rt-stack-head { flex:0 0 44px; height:44px; display:flex; align-items:center; justify-content:space-between; }
.rt-stack-title { display:inline-flex; align-items:center; gap:6px; font-weight:300; font-size:12px; color:${n}; }
.rt-stack-search { flex:0 0 32px; display:flex; align-items:center; gap:8px; width:180px; height:32px; padding:0 14px; box-sizing:border-box; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); }
.rt-stack-search input { flex:1; min-width:0; border:none; background:transparent; outline:none; color:#fff; font-family:'Outfit',sans-serif; font-weight:500; font-size:11px; min-height:36px; }
/* 44 + 32 + 2 = 78px below the shell top → canvas y566 collapsed, y171 expanded. */
.rt-chips { flex:0 0 auto; margin-top:2px; display:flex; gap:8px; }
.rt-chip { padding:6px 13px; min-height:36px; border-radius:9999px; font-size:11px; cursor:pointer; transition:background .15s ease, color .15s ease; white-space:nowrap; }
/* The only part of the shell that resizes. */
.rt-rows { flex:1; min-height:0; margin-top:8px; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none; }
.rt-rows::-webkit-scrollbar { display:none; }
.rt-row { display:flex; align-items:center; gap:13px; padding:9px 0; }
.rt-row-live { cursor:pointer; }
.rt-row-live:hover .rt-row-name { color:#fff; }
.rt-avatar { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.8); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; color:#fff; flex:0 0 auto; text-transform:uppercase; box-sizing:border-box; }
.rt-row-mid { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.rt-row-name { font-weight:700; font-size:13px; color:${T}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color .15s ease; }
.rt-row-status { display:flex; align-items:center; gap:5px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.5); }
.rt-dot { width:5px; height:5px; border-radius:50%; flex:0 0 auto; }
.rt-row-amt { font-weight:800; font-size:14.5px; color:#fff; font-variant-numeric:tabular-nums; }
.rt-row-actions { display:flex; gap:8px; padding:0 0 10px 53px; animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }
.rt-row-act { padding:6px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.5); background:transparent; font-weight:600; font-size:11px; color:${n}; cursor:pointer; transition:background .15s ease; }
.rt-row-act:hover:not(:disabled) { background:rgba(94,158,255,0.1); }
.rt-row-act:disabled { opacity:0.5; cursor:default; }
.rt-row-act-danger { border-color:rgba(240,101,108,0.5); color:${ve}; }
.rt-row-act-danger:hover:not(:disabled) { background:rgba(240,101,108,0.1); }
.rt-row-link-note { align-self:center; max-width:215px; font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.48); }
.rt-empty { padding:20px 0; font-weight:300; font-size:12.5px; color:rgba(191,209,255,0.5); }

/* ── centre rail (design places it absolutely at x=550) ── */
/* The slot only reserves the rail's horizontal share of the row; the rail's
   own position is explicit (see .terminal-rail), never derived from here. */
.rt-rail-slot { flex:0 0 76px; margin:0 40px 0 44px; }
/* Geometry lives in .terminal-rail; this keeps only the skin. */
.rt-rail { border:1.5px solid rgba(94,158,255,0.7); border-radius:32px; }
.rt-rail-btn { width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease; }
.rt-rail-btn:hover { background:rgba(94,158,255,0.14); }
.rt-rail-big { width:54px; height:54px; background:${j}; box-shadow:0 8px 20px rgba(102,169,255,0.35); }
.rt-rail-big:hover { background:${j}; opacity:0.9; }

/* ── right panel ── */
/* Geometry lives in .terminal-panel; every child is zone-positioned. */
.rt-panel { }
.rt-mode { animation:tileIn var(--m-dur-ui) var(--m-ease-out) both; }

/* send: design pins the two blocks at screen y=154 / y=512 (panel origin = y 92) */
/* .rt-send-top / .rt-send-lower are retired: send's content now lives in the
   shared Zone A/B/C wrappers instead of two independently positioned blocks. */
.terminal-zone-b > .rt-field,
.terminal-zone-b > .rt-split-toggle { margin-top:14px; }
.rt-amt-row { display:flex; align-items:baseline; gap:12px; }
.rt-amt { font-family:'Outfit',sans-serif; font-weight:700; font-size:66px; line-height:0.95; color:${ne}; font-variant-numeric:tabular-nums; }
.rt-edit { font-weight:300; font-size:12px; color:${n}; cursor:pointer; background:transparent; }
.rt-destination-label { margin-top:18px; font-weight:700; font-size:9px; letter-spacing:0.16em; color:rgba(244,246,255,0.65); }
/* ── payment board picker ──────────────────────────────────────────────────
   Progressive disclosure, all in the wireframe idiom: an outlined pill that
   goes solid when engaged, a second pill that pops in beside it, and an
   outlined dropdown that expands to its own height. Nothing overshoots except
   the side-pop, which is a deliberate accent. */
.rt-boards { margin-top:8px; display:flex; flex-direction:column; align-items:flex-start; gap:8px; }
.rt-boards-row { display:flex; align-items:center; gap:8px; }

/* The wireframe base. Text is deliberately lighter than the app's other pills
   so an un-engaged control reads as available rather than as active. */
.rt-wire {
  padding:9px 20px; border-radius:9999px; font-size:12.5px; text-transform:lowercase;
  border:1px solid rgba(94,158,255,0.5); background:transparent;
  color:rgba(127,178,255,0.68); font-weight:500; cursor:pointer; white-space:nowrap;
  transition:background .18s var(--m-ease-out), color .18s var(--m-ease-out), border-color .18s var(--m-ease-out);
}
.rt-wire:hover { border-color:rgba(94,158,255,0.85); color:${n}; }
.rt-boards-toggle.on {
  background:${j}; border-color:transparent; color:${O}; font-weight:700;
}
.rt-boards-toggle.on:hover { background:${j}; color:${O}; }

@keyframes rtSidePop { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:none; } }
.rt-sidepop { animation:rtSidePop var(--m-dur-ui) var(--m-ease-pop) both; }

.rt-picker-btn { display:inline-flex; align-items:center; gap:9px; max-width:220px; }
.rt-picker-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rt-caret { flex:0 0 auto; transition:transform .2s var(--m-ease-out); }
.rt-caret.open { transform:rotate(180deg); }

/* grid-template-rows 0fr→1fr expands to the content's own height, so the panel
   never needs a magic max-height that would clip a long list. */
.rt-drop {
  display:grid; grid-template-rows:0fr; opacity:0; width:248px;
  transition:grid-template-rows .24s var(--m-ease-out), opacity .16s var(--m-ease-out);
}
.rt-drop.open { grid-template-rows:1fr; opacity:1; }
.rt-drop-inner { overflow:hidden; min-height:0; }
.rt-drop-list {
  border:1px solid rgba(94,158,255,0.5); border-radius:16px; padding:5px;
  display:flex; flex-direction:column; gap:1px;
  max-height:236px; overflow-y:auto; scrollbar-width:none;
}
.rt-drop-list::-webkit-scrollbar { display:none; }
.rt-drop-row { display:flex; align-items:center; gap:3px; }
.rt-drop-pick {
  flex:1; min-width:0; text-align:left; padding:8px 12px; border-radius:11px;
  border:none; background:transparent; color:rgba(127,178,255,0.68);
  font-weight:500; font-size:12px; cursor:pointer; text-transform:lowercase;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-pick:hover { background:rgba(94,158,255,0.1); color:${n}; }
.rt-drop-pick[aria-checked="true"] { background:rgba(94,158,255,0.16); color:#EAF2FF; font-weight:700; }
.rt-drop-edit {
  flex:0 0 auto; width:26px; height:26px; border-radius:8px; border:none;
  background:transparent; color:rgba(127,178,255,0.5);
  display:grid; place-items:center; cursor:pointer;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-edit:hover { background:rgba(94,158,255,0.12); color:${n}; }
.rt-drop-input {
  flex:1; min-width:0; padding:7px 11px; border-radius:11px; font-size:12px;
  border:1px solid rgba(94,158,255,0.5); background:transparent;
  color:#EAF2FF; font-family:inherit; outline:none;
}
.rt-drop-input::placeholder { color:rgba(127,178,255,0.45); }
.rt-drop-sep { height:1px; background:rgba(94,158,255,0.22); margin:4px 8px; flex:0 0 auto; }
.rt-drop-create {
  flex:1; text-align:left; padding:8px 12px; border-radius:11px; border:none;
  background:transparent; color:rgba(127,178,255,0.68); font-weight:600;
  font-size:12px; cursor:pointer; text-transform:lowercase;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-create:hover:not(:disabled) { background:rgba(94,158,255,0.1); color:${n}; }
.rt-drop-create:disabled { opacity:0.5; cursor:default; }

@media (prefers-reduced-motion: reduce) {
  .rt-sidepop { animation:none; }
  .rt-drop { transition:none; }
}
.rt-board-hint, .rt-inline-status { font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.48); }
.rt-inline-error { font-weight:600; font-size:10.5px; color:${ve}; }
.rt-item-name { margin-top:16px; font-weight:300; font-size:16px; color:${T}; text-transform:lowercase; }
.rt-item-hint { margin-top:4px; font-weight:500; font-size:13px; color:rgba(244,246,255,0.5); }
.rt-field { display:flex; flex-direction:column; gap:8px; }
.rt-field-label { font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.65); }
.rt-name-input { height:50px; border-radius:9999px; border:none; outline:none; background:#fff; padding:0 22px; box-sizing:border-box; color:${We}; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; }
.rt-split-toggle { display:flex; align-items:center; justify-content:space-between; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.rt-split-text { display:flex; flex-direction:column; gap:1px; }
.rt-split-cap { font-weight:600; font-size:8.5px; letter-spacing:0.08em; color:rgba(244,246,255,0.65); }
.rt-split-desc { font-weight:600; font-size:13px; color:${T}; }
.rt-switch { position:relative; width:48px; height:29px; border-radius:9999px; cursor:pointer; transition:background .18s ease; flex:0 0 auto; }
.rt-knob { position:absolute; top:4px; left:4px; width:21px; height:21px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(10,17,40,0.25); transition:transform .18s ease; }
.rt-fee { font-weight:500; font-size:11px; color:rgba(244,246,255,0.4); }
.rt-send-btn { margin:0; width:100%; height:100%; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.7); background:transparent; font-weight:300; font-size:13.5px; color:${T}; cursor:pointer; transition:background .15s ease, border-color .2s ease, color .2s ease; }
.rt-send-btn:hover:not(:disabled) { background:rgba(94,158,255,0.08); }
.rt-send-btn:disabled { opacity:0.55; cursor:default; }
.rt-send-btn-split { margin:0; font-weight:700; }
/* Zone C fills with whichever primary action the mode owns. */
.terminal-zone-c > .rt-new-sale { width:100%; height:100%; align-self:auto; padding:0; }
/* Sits under the CTA without adding to Zone C's fixed 46px box. */
.rt-cta-status { position:absolute; left:0; top:calc(100% + 8px); width:100%; text-align:center; }

/* keypad */
.rt-kp-head { display:flex; align-items:center; justify-content:space-between; }
.rt-kp-circle { width:40px; height:40px; border-radius:50%; border:1.5px solid rgba(94,158,255,0.7); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s ease; }
.rt-kp-circle:hover { background:rgba(94,158,255,0.08); }
.rt-kp-amt { margin-top:10px; text-align:center; font-family:'Outfit',sans-serif; font-weight:700; font-size:68px; line-height:1; color:${ne}; font-variant-numeric:tabular-nums; }
.rt-kp-quick { margin-top:24px; display:flex; justify-content:center; gap:10px; }
.rt-kp-quick-btn { padding:9px 20px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:12.5px; color:${n}; cursor:pointer; transition:background .15s ease; }
.rt-kp-quick-btn:hover { background:rgba(94,158,255,0.08); }
.rt-kp-hint { margin-top:58px; text-align:center; font-weight:500; font-size:13px; color:rgba(198,207,226,0.75); }
.rt-kp-grid { margin:36px auto 0; display:grid; grid-template-columns:repeat(3,80px); gap:36px 56px; justify-content:center; }
.rt-kp-key { width:80px; height:80px; border-radius:50%; font-size:34px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; font-family:'Outfit',sans-serif; box-sizing:border-box; transition:opacity .12s ease; }
.rt-kp-key:hover { opacity:0.88; }

/* stock tiles */
.rt-stock { margin-top:40px; }
.rt-stock-head { font-weight:300; font-size:15px; color:${ne}; }
.rt-stock-grid { margin-top:22px; display:grid; grid-template-columns:repeat(3,1fr); gap:12px; max-width:560px; max-height:600px; overflow-y:auto; padding-bottom:10px; }
.rt-stock-empty { grid-column:1 / -1; }
.rt-tile { position:relative; display:flex; flex-direction:column; height:124px; border-radius:14px; background:#fff; box-sizing:border-box; padding:14px; cursor:pointer; text-align:left; transition:transform .15s ease, box-shadow .15s ease; }
.rt-tile:hover { transform:translateY(-2px); box-shadow:0 10px 24px rgba(0,4,28,0.28); }
.rt-tile-ico { width:32px; height:32px; border-radius:10px; background:#EEF1F8; display:flex; align-items:center; justify-content:center; font-size:17px; line-height:1; }
.rt-tile-name { margin-top:auto; font-weight:700; font-size:13px; color:${We}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-tile-price { position:absolute; top:14px; right:14px; font-family:'Outfit',sans-serif; font-weight:800; font-size:13.5px; color:${Mt}; }

/* split */

.rt-split-lead { font-weight:600; font-size:15px; color:rgba(198,207,226,0.8); }
.rt-split-body { margin-top:24px; display:flex; flex-direction:column; gap:18px; }
.rt-split-chips { display:flex; gap:10px; }
.rt-split-chip { flex:1; height:44px; border-radius:9999px; font-size:12.5px; cursor:pointer; transition:background .15s ease, color .15s ease; }
.rt-split-each { display:flex; align-items:center; justify-content:space-between; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); font-weight:600; font-size:13px; color:rgba(244,246,255,0.6); }
.rt-split-each-amt { font-family:'Outfit',sans-serif; font-weight:800; font-size:20px; color:${T}; }

/* share */

.rt-share-head { font-weight:300; font-size:15px; color:${ne}; }
.rt-share-sub { margin-top:4px; font-weight:500; font-size:12px; color:rgba(244,246,255,0.65); }
.rt-share-body { margin-top:28px; display:flex; flex-direction:column; gap:14px; }
.rt-share-link { display:flex; align-items:center; gap:12px; height:54px; padding:0 20px; box-sizing:border-box; border-radius:12px; border:1.5px solid rgba(94,158,255,0.55); }
.rt-share-url { flex:1; min-width:0; font-weight:600; font-size:13px; color:${T}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-share-copy { font-weight:700; font-size:12px; color:${n}; cursor:pointer; flex:0 0 auto; background:transparent; }
.rt-share-actions { display:flex; gap:10px; }
.rt-share-act { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:600; font-size:12.5px; color:${n}; cursor:pointer; transition:background .15s ease; }
.rt-share-act:hover { background:rgba(94,158,255,0.08); }
.rt-current-destination { font-weight:600; font-size:11px; color:rgba(244,246,255,0.48); text-transform:lowercase; }
.rt-new-sale { align-self:flex-start; padding:8px 17px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:11.5px; color:${n}; cursor:pointer; }
.rt-share-empty-state { margin-top:28px; display:flex; flex-direction:column; align-items:flex-start; gap:18px; padding:22px; border-radius:14px; border:1px solid rgba(94,158,255,0.35); font-weight:500; font-size:12.5px; color:rgba(244,246,255,0.62); }
.rt-share-empty-state p { margin:0; }
`;export{ir as default};
