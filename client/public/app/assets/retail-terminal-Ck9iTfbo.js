import{r as i,j as e}from"./vendor-react-Bym1zpZ6.js";import{u as kt,a as te,b as re}from"./vendor-query-DOnMPzUI.js";import{g as vt}from"./auth-Q_DEPDb-.js";import{u as jt,d as ae,e as se,M as x,f as Nt,j as ie,h as St}from"./index-BImdaJ_D.js";import{D as zt}from"./DesktopPageScaffold-DUeWk4Py.js";import{f as Ct,D as Et,a as Ft,d as $t,b as Tt}from"./desktop-keypad-B0KPTi__.js";import{D as Ve}from"./DesktopLoadFailure-D7yTfHby.js";import{a as Lt}from"./response-data-DLWISmZ_.js";import"./helpers-2bMVvZI7.js";import"./vendor-router-D1z0FhFb.js";import"./vendor-radix-DRNifoMd.js";import"./vendor-lucide-CuEUB03e.js";import"./vendor-motion-Cxs569HU.js";import"./vendor-forms-BvU1B9Fz.js";import"./DesktopChrome-D0EDmZr-.js";const je="#5E9EFF",o="#7FB2FF",Mt="#4A86F0",j="#66A9FF",T="#F4F6FF",_="#000F3F",Ye="#12162E",It="#1D48C8",ne="#C6CFE2",Pt="#35D07F",Ne="#F0656C",Bt="#F0A34E",Se="#9DBCFF",Ge="Maximum 10 tapt stones allowed per merchant";function ve(l){const s=l instanceof Error?l.message:String(l??""),c=s.match(/^(\d{3}):\s*/),p=c?Number(c[1]):null,b=c?s.slice(c[0].length):s,g=b.indexOf("{");if(g>=0)try{const u=JSON.parse(b.slice(g));if(typeof(u==null?void 0:u.message)=="string"&&u.message.trim())return{status:p,message:u.message.trim()}}catch{}return{status:p,message:b.trim()}}const L=l=>parseFloat(String(l??"0")||"0")||0,M=l=>"$"+l.toLocaleString("en-NZ",{minimumFractionDigits:2,maximumFractionDigits:2}),Kt=l=>"$"+Math.round(l).toLocaleString("en-NZ");function Dt(l){const s=String(l??"").trim().split(/\s+/).filter(c=>/^[a-z0-9]/i.test(c));return s.length===0?"–":s.length===1?s[0].slice(0,2).toUpperCase():(s[0][0]+s[1][0]).toUpperCase()}function Rt(l){switch(l){case"completed":return{bucket:"paid",label:"paid",dot:Pt};case"failed":case"cancelled":return{bucket:"failed",label:l==="cancelled"?"cancelled":"failed",dot:Ne};case"refunded":return{bucket:"refunded",label:"refunded",dot:Se};case"partially_refunded":return{bucket:"refunded",label:"partly refunded",dot:Se};default:return{bucket:"awaiting",label:"awaiting payment",dot:Bt}}}const qt=["all","awaiting payment","paid","failed"],At={all:null,"awaiting payment":"awaiting",paid:"paid",failed:"failed"},Ut=["5","10","15","20"],Ot=[2,3,4,6];function nr(l){const s=vt(),c=kt(),{toast:p}=jt(),[b,g]=i.useState("send"),[u,oe]=i.useState(0),[ze,I]=i.useState(""),[P,le]=i.useState(""),[z,de]=i.useState({kind:"no-board"}),[h,ce]=i.useState(null),[m,B]=i.useState(null),pe=i.useRef(!1),[K,N]=i.useState(null),[Q,Ce]=i.useState(!1),[he,Ze]=i.useState(2),[ue,He]=i.useState(""),[C,Xe]=i.useState("all"),[Ee,W]=i.useState(null),[Je,Fe]=i.useState(null),[D,$e]=i.useState(!1),Te=i.useRef(null),Le=i.useRef(null),Me=i.useRef({}),[V,Ie]=i.useState(!1),[me,Y]=i.useState(!1),[et,G]=i.useState(null),[tt,Z]=i.useState(!1),[H,S]=i.useState(""),X=async t=>{const r=await St(t);if(!r.ok)throw new Error(t);return Lt(t,await r.json())},rt=te({queryKey:[x,s,"profile"],queryFn:()=>X(ie("GET /api/merchants/:id/profile",{id:s})),enabled:!!s}),w=te({queryKey:[x,s,"transactions"],queryFn:()=>X(ie("GET /api/merchants/:id/transactions",{id:s})),refetchInterval:5e3,enabled:!!s}),E=te({queryKey:[x,s,"stock-items"],queryFn:()=>X(ie("GET /api/merchants/:merchantId/stock-items",{merchantId:s})),enabled:!!s}),f=te({queryKey:[x,s,"tapt-stones"],queryFn:()=>X(ie("GET /api/merchants/:id/tapt-stones",{id:s})),enabled:!!s}),R=w.isError&&w.data===void 0,at=E.isError&&E.data===void 0,st=()=>{w.refetch()},it=()=>{E.refetch()},Pe=R?"Available once your sales load":void 0,J=w.data??[],Be=E.data??[],F=f.data??[],xe=rt.data,y=re({mutationFn:async t=>(await ae(...se("POST /api/transactions"),{merchantId:s,itemName:t.item,price:t.price,status:"pending",splitEnabled:t.splitEnabled,...t.destination.kind==="no-board"?{linkMode:"per_payment"}:{selectedStoneId:t.destination.boardId,linkMode:"legacy"}})).json(),onMutate:()=>{ce(null),B(null),W(null)},onSuccess:(t,r)=>{c.invalidateQueries({queryKey:[x,s,"transactions"]}),c.invalidateQueries({queryKey:[x,s,"active-transaction"]});const a=typeof(t==null?void 0:t.paymentUrl)=="string"?t.paymentUrl.trim():"",n=typeof(t==null?void 0:t.qrCodeUrl)=="string"?t.qrCodeUrl.trim():"";if(!a||!n){const d="The sale was created, but its private share link was not returned. Start a new sale to try again.";B(d),g("share"),p({title:"Payment link unavailable",description:d,variant:"destructive"})}else ce({item:r.item,amount:L(r.price),paymentUrl:a,qrCodeUrl:n,destination:r.destination}),g("share");le(""),oe(0),Ce(!1)},onError:t=>{if(Nt(t))return;const a=ve(t).message||"Please try again";B(a),p({title:"Couldn't start the sale",description:a,variant:"destructive"})},onSettled:()=>{pe.current=!1}}),q=re({mutationFn:async t=>{const r=t==null?void 0:t.trim();return(await ae(...se("POST /api/merchants/:id/tapt-stones",{id:s}),r?{name:r}:{})).json()},onMutate:()=>N(null),onSuccess:t=>{if(typeof(t==null?void 0:t.id)!="number"){N("New board created, but its details could not be loaded"),f.refetch();return}Z(!1),S(""),Ie(!0),Y(!1),c.setQueryData([x,s,"tapt-stones"],(r=[])=>[...r.filter(a=>a.id!==t.id),t].sort((a,n)=>a.stoneNumber-n.stoneNumber)),de({kind:"board",boardId:t.id}),N(null),c.invalidateQueries({queryKey:[x,s,"tapt-stones"]}),p({title:"New board created",description:`${t.name} selected`})},onError:t=>{const r=ve(t),a=r.message||"Failed to create a new board";N(a),r.status===409&&f.refetch(),p({title:a===Ge?"Board limit reached":"Couldn't create board",description:a,variant:"destructive"})}}),nt=re({mutationFn:async({id:t,name:r})=>(await ae(...se("PUT /api/merchants/:merchantId/tapt-stones/:stoneId",{merchantId:s,stoneId:t}),{name:r.trim()})).json(),onMutate:()=>N(null),onSuccess:(t,{id:r,name:a})=>{c.setQueryData([x,s,"tapt-stones"],(n=[])=>n.map(d=>d.id===r?{...d,...t,name:(t==null?void 0:t.name)??a.trim()}:d)),G(null),S(""),c.invalidateQueries({queryKey:[x,s,"tapt-stones"]})},onError:t=>{const r=ve(t).message||"Couldn't rename that board";N(r),p({title:"Couldn't rename board",description:r,variant:"destructive"})}}),ge=re({mutationFn:async t=>(await ae(...se("POST /api/transactions/:id/cancel",{id:t}),{})).json(),onSuccess:()=>{c.invalidateQueries({queryKey:[x,s,"transactions"]}),c.invalidateQueries({queryKey:[x,s,"active-transaction"]}),p({title:"Transaction cancelled"}),Fe(null)},onError:()=>p({title:"Failed to cancel",variant:"destructive"})}),{revenueToday:ot,txnsToday:lt,pctVsYesterday:be}=i.useMemo(()=>{const t=new Date;t.setHours(0,0,0,0);const r=new Date(t.getTime()-864e5);let a=0,n=0,d=0;for(const v of J){const O=new Date(v.createdAt);O>=t?(d+=1,v.status==="completed"&&(a+=L(v.price))):O>=r&&v.status==="completed"&&(n+=L(v.price))}return{revenueToday:a,txnsToday:d,pctVsYesterday:n>0?Math.round((a-n)/n*100):null}},[J]),Ke=i.useMemo(()=>{const t=ue.trim().toLowerCase(),r=At[C];return[...J].sort((a,n)=>new Date(n.createdAt).getTime()-new Date(a.createdAt).getTime()).map(a=>({...a,meta:Rt(a.status)})).filter(a=>r===null?!0:a.meta.bucket===r).filter(a=>(a.itemName??"").toLowerCase().includes(t))},[J,ue,C]),dt=he>0?u/he:u,A=z.kind==="board"?F.find(t=>t.id===z.boardId):void 0,fe=(h==null?void 0:h.destination.kind)==="board"?h.destination.boardId:null,ye=fe==null?void 0:F.find(t=>t.id===fe),ee=F.length>=10,k=t=>t.name||`board ${t.stoneNumber}`;i.useEffect(()=>{if(!D)return;const t=r=>{var a;r.key==="Escape"&&(r.stopPropagation(),$e(!1),(a=Te.current)==null||a.focus())};return document.addEventListener("keydown",t),()=>document.removeEventListener("keydown",t)},[D]),i.useEffect(()=>{const t=Le.current;t&&(t.scrollTop=Me.current[C]??0)},[C]);const we=i.useRef(!1),$=()=>{G(null),Z(!1),S("")},De=t=>{t.key==="Enter"?(t.preventDefault(),t.currentTarget.blur()):t.key==="Escape"&&(we.current=!0,t.currentTarget.blur())},Re=t=>{if(we.current){we.current=!1,$();return}t()},ct=()=>{Ie(t=>t?(Y(!1),$(),de({kind:"no-board"}),N(null),!1):!0)},pt=t=>{de({kind:"board",boardId:t}),Y(!1),$()},ht=t=>{Z(!1),G(t.id),S(k(t))},ut=t=>{const r=H.trim();if(!r){$();return}const a=F.find(n=>n.id===t);if(a&&k(a)===r){$();return}nt.mutate({id:t,name:r})},mt=()=>{q.isPending||q.mutate(H.trim()||void 0)},qe=t=>{if(!pe.current){if(u<=0){p({title:"Enter an amount first",variant:"destructive"});return}if(!P.trim()){p({title:"Item name is required",variant:"destructive"});return}if(z.kind==="board"&&!A){const r="That board is no longer available. Choose another destination.";B(r),p({title:"Choose a destination",description:r,variant:"destructive"});return}pe.current=!0,y.mutate({item:P.trim(),price:u.toFixed(2),splitEnabled:t,destination:z})}},ke=()=>{ce(null),B(null),W(null)},xt=t=>I(r=>$t(r,t)),Ae=()=>{ke(),I(""),g("keypad")},gt=()=>{oe(Tt(ze)/100),I(""),g("send")},bt=()=>{I(""),g("send")},ft=t=>{ke(),le(t.name),oe(L(t.cost)),g("send")},Ue=t=>{ke(),t==="keypad"?Ae():g(t)},Oe=async(t,r)=>{if(t)try{await navigator.clipboard.writeText(t),W(r),setTimeout(()=>W(a=>a===r?null:a),1500),p({title:"Link copied",description:"Payment link copied to clipboard"})}catch{p({title:"Copy failed",description:"Unable to copy payment link",variant:"destructive"})}},_e=(t,r)=>{if(r)if(t==="email"){const a=encodeURIComponent(`Payment Request - ${(xe==null?void 0:xe.businessName)||"Payment"}`),n=encodeURIComponent(`Please complete your payment using this link: ${r}`);window.open(`mailto:?subject=${a}&body=${n}`,"_blank")}else window.open(`sms:?body=${encodeURIComponent(`Payment link: ${r}`)}`,"_blank")},yt=t=>window.open(t,"_blank"),U=(t,r,a,n)=>{const d=b===t;return e.jsx("button",{type:"button",className:r?"rt-rail-btn rt-rail-big":"rt-rail-btn","aria-label":n,"aria-pressed":d,style:r?void 0:{background:d?j:"transparent"},onClick:()=>t==="share"?g("share"):Ue(t),children:e.jsx("svg",{width:r?24:19,height:r?24:19,viewBox:"0 0 24 24",fill:"none",stroke:r||d?_:o,strokeWidth:r?2.4:1.8,strokeLinecap:"round",strokeLinejoin:"round",children:a})})},Qe=(t,r=1)=>({border:t?`${r}px solid transparent`:`${r}px solid rgba(94,158,255,0.5)`,background:t?j:"transparent",color:t?_:o,fontWeight:t?700:600}),We=y.isPending?"creating private link…":"send payment";return e.jsxs(zt,{...l,vertical:"retail",page:"terminal",showScope:!1,children:[e.jsx("style",{children:_t}),e.jsxs("div",{className:"rt-body",children:[e.jsxs("div",{className:"rt-left dt-cascade",children:[e.jsx("div",{children:e.jsxs("button",{type:"button",className:"rt-scope","aria-label":"my store scope","aria-haspopup":"listbox",children:[e.jsx("span",{children:"my store"}),e.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"m6 9 6 6 6-6"})})]})}),R?e.jsx("div",{className:"rt-hero-row",children:e.jsx(Ve,{tone:"canvas",title:"Sales didn't load",detail:"Your totals stay hidden until they do.",onRetry:st,retrying:w.isFetching,testId:"retail-terminal-sales-failed"})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"rt-hero-row",children:[e.jsx("span",{className:"rt-hero",children:w.isLoading?"—":Kt(ot)}),be!==null&&e.jsxs("span",{className:"rt-hero-pill",children:[be>=0?"+":"",be,"%"]})]}),e.jsx("span",{className:"rt-hero-sub",children:"sales revenue today"}),e.jsx("span",{className:"rt-hero rt-hero-dim",children:w.isLoading?"—":lt}),e.jsx("span",{className:"rt-hero-sub rt-hero-sub-dim",children:"transactions today"})]}),e.jsxs("div",{className:"rt-stack","data-tutorial-id":"retail-terminal-live-payments","data-expanded":D?"true":"false",children:[e.jsx("div",{className:"rt-stack-head",children:e.jsxs("button",{type:"button",ref:Te,className:"rt-stack-toggle","aria-expanded":D,"aria-label":D?"collapse active stack":"expand active stack",onClick:()=>$e(t=>!t),children:[e.jsx("span",{className:"rt-stack-title",children:"active stack"}),e.jsx("svg",{className:"rt-stack-caret",width:"10",height:"10",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e.jsx("path",{d:"m6 14 6-6 6 6"})})]})}),e.jsxs("div",{className:"rt-stack-search",children:[e.jsxs("svg",{width:"11",height:"11",viewBox:"0 0 24 24",fill:"none",stroke:je,strokeWidth:"2",strokeLinecap:"round",children:[e.jsx("circle",{cx:"11",cy:"11",r:"6.5"}),e.jsx("path",{d:"m20 20-3.8-3.8"})]}),e.jsx("input",{value:ue,onChange:t=>He(t.target.value),placeholder:"search sales","aria-label":"search active stack"})]}),e.jsx("div",{className:"rt-chips",children:qt.map(t=>e.jsx("button",{type:"button",className:"rt-chip",style:Qe(t===C),onClick:()=>Xe(t),children:t},t))}),e.jsx("div",{className:"rt-rows",tabIndex:0,role:"region","aria-label":"Sales",ref:Le,onScroll:t=>{Me.current[C]=t.currentTarget.scrollTop},children:w.isLoading?e.jsx("div",{className:"rt-empty",children:"loading…"}):R?e.jsx("div",{className:"rt-empty",children:"sales didn't load"}):Ke.length===0?e.jsx("div",{className:"rt-empty",children:"no sales yet"}):Ke.map(t=>{var O;const r=t.meta.bucket==="awaiting",a=Je===t.id,n=F.find(wt=>wt.id===t.taptStoneId),d=((O=n==null?void 0:n.paymentUrl)==null?void 0:O.trim())||"",v=e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"rt-avatar",children:Dt(t.itemName||"sale")}),e.jsxs("span",{className:"rt-row-mid",children:[e.jsx("span",{className:"rt-row-name",children:t.itemName||"sale"}),e.jsxs("span",{className:"rt-row-status",children:[e.jsx("span",{className:"rt-dot",style:{background:t.meta.dot}}),t.meta.label,t.isSplit?` · ${t.completedSplits??0}/${t.totalSplits??1} split`:""]})]}),e.jsx("span",{className:"rt-row-amt",children:M(L(t.price))})]});return e.jsxs("div",{className:"rt-row-wrap",children:[r?e.jsx("button",{type:"button",className:"rt-row rt-row-live","aria-expanded":a,onClick:()=>Fe(a?null:t.id),children:v}):e.jsx("div",{className:"rt-row",children:v}),r&&a&&e.jsxs("div",{className:"rt-row-actions",children:[d?e.jsx("button",{type:"button",className:"rt-row-act",onClick:()=>Oe(d,`tx-${t.id}`),children:Ee===`tx-${t.id}`?"copied ✓":"copy board link"}):e.jsx("span",{className:"rt-row-link-note",children:"private link available only when the sale starts"}),e.jsx("button",{type:"button",className:"rt-row-act rt-row-act-danger",disabled:ge.isPending,onClick:()=>ge.mutate(t.id),children:ge.isPending?"cancelling…":"cancel"})]})]},t.id)})})]})]}),e.jsx("div",{className:"rt-rail-slot",children:e.jsxs("div",{className:"rt-rail terminal-rail dt-rise","data-tutorial-id":"retail-terminal-tools",style:{"--dt-i":6},children:[U("stock",!1,e.jsxs(e.Fragment,{children:[e.jsx("rect",{x:"4",y:"4",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"13",y:"4",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"4",y:"13",width:"7",height:"7",rx:"1.5"}),e.jsx("rect",{x:"13",y:"13",width:"7",height:"7",rx:"1.5"})]}),"stock tiles"),U("split",!1,e.jsxs(e.Fragment,{children:[e.jsx("path",{d:"M12 3v7"}),e.jsx("path",{d:"M12 10l-6 8"}),e.jsx("path",{d:"M12 10l6 8"})]}),"split bill"),U("keypad",!0,e.jsx("path",{d:"M12 5v14M5 12h14"}),"keypad"),U("share",!1,e.jsxs(e.Fragment,{children:[e.jsx("circle",{cx:"18",cy:"5",r:"2.6"}),e.jsx("circle",{cx:"6",cy:"12",r:"2.6"}),e.jsx("circle",{cx:"18",cy:"19",r:"2.6"}),e.jsx("path",{d:"m8.3 10.7 7.4-4.4M8.3 13.3l7.4 4.4"})]}),"share payment link"),U("send",!1,e.jsxs(e.Fragment,{children:[e.jsx("path",{d:"M22 2 11 13"}),e.jsx("path",{d:"M22 2 15 22l-4-9-9-4z"})]}),"compose sale")]})}),e.jsxs("div",{className:"rt-panel terminal-panel dt-rise",style:{"--dt-i":7},children:[b==="send"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-mode terminal-zone-a",children:e.jsxs("div",{className:"rt-amt-row","data-tutorial-id":"retail-terminal-amount",children:[e.jsx("span",{className:"rt-amt",children:M(u)}),e.jsx("button",{type:"button",className:"rt-edit",onClick:Ae,children:"edit>"})]})}),e.jsxs("div",{className:"rt-mode terminal-zone-b",children:[e.jsx("div",{className:"rt-destination-label",id:"rt-destination-label",children:"PAYMENT DESTINATION"}),e.jsxs("div",{className:"rt-boards","data-tutorial-id":"retail-terminal-destination",children:[e.jsxs("div",{className:"rt-boards-row",children:[e.jsx("button",{type:"button",className:`rt-wire rt-boards-toggle${V?" on":""}`,"aria-pressed":V,onClick:ct,children:"payment boards"}),V&&e.jsxs("button",{type:"button",className:"rt-wire rt-picker-btn rt-sidepop","aria-haspopup":"true","aria-expanded":me,"aria-controls":"rt-board-list","aria-label":A?`selected board: ${k(A)}`:"select board",onClick:()=>{Y(t=>!t),$()},children:[e.jsx("span",{className:"rt-picker-label",children:A?k(A):"select board"}),e.jsx("svg",{className:`rt-caret${me?" open":""}`,width:"11",height:"11",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2.4",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e.jsx("path",{d:"m6 9 6 6 6-6"})})]})]}),V&&e.jsx("div",{className:`rt-drop${me?" open":""}`,children:e.jsx("div",{className:"rt-drop-inner",children:e.jsxs("div",{id:"rt-board-list",className:"rt-drop-list",role:"radiogroup","aria-label":"payment boards",children:[F.map(t=>e.jsx("div",{className:"rt-drop-row",children:et===t.id?e.jsx("input",{className:"rt-drop-input",autoFocus:!0,value:H,"aria-label":`rename ${k(t)}`,maxLength:60,onChange:r=>S(r.target.value),onBlur:()=>Re(()=>ut(t.id)),onKeyDown:De}):e.jsxs(e.Fragment,{children:[e.jsx("button",{type:"button",role:"radio","aria-checked":z.kind==="board"&&z.boardId===t.id,"aria-label":`${k(t)}, board ${t.stoneNumber}`,className:"rt-drop-pick",onClick:()=>pt(t.id),children:k(t)}),e.jsx("button",{type:"button",className:"rt-drop-edit","aria-label":`rename ${k(t)}`,onClick:()=>ht(t),children:e.jsxs("svg",{width:"13",height:"13",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[e.jsx("path",{d:"M12 20h9"}),e.jsx("path",{d:"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"})]})})]})},t.id)),e.jsx("div",{className:"rt-drop-sep",role:"presentation"}),e.jsx("div",{className:"rt-drop-row",children:tt?e.jsx("input",{className:"rt-drop-input",autoFocus:!0,value:H,placeholder:"board name","aria-label":"new board name",maxLength:60,onChange:t=>S(t.target.value),onBlur:()=>Re(mt),onKeyDown:De}):e.jsx("button",{type:"button",className:"rt-drop-create","aria-label":"create new board","aria-busy":q.isPending,"aria-describedby":f.isLoading||f.isError||K||ee?"rt-board-status":void 0,disabled:q.isPending||ee,onClick:()=>{G(null),S(""),Z(!0)},children:q.isPending?"creating board…":"+ create board"})})]})})}),(f.isLoading||f.isError||K||ee)&&e.jsx("span",{id:"rt-board-status",className:f.isError||K?"rt-inline-error":"rt-board-hint",role:f.isError||K?"alert":"status","aria-live":"polite",children:K||(f.isError?"Boards couldn't be loaded. No board remains available.":ee?Ge:"loading boards…")})]}),e.jsx("div",{className:"rt-item-name",children:P||"new sale"}),e.jsx("div",{className:"rt-item-hint",children:"tap send to share payment"}),e.jsxs("div",{className:"rt-field",children:[e.jsx("span",{className:"rt-field-label",children:"ITEM NAME"}),e.jsx("input",{className:"rt-name-input",value:P,onChange:t=>le(t.target.value),placeholder:"enter item name or tap a stock tile","aria-label":"item name"})]}),e.jsxs("div",{className:"rt-split-toggle",children:[e.jsxs("span",{className:"rt-split-text",children:[e.jsx("span",{className:"rt-split-cap",children:"split bill"}),e.jsx("span",{className:"rt-split-desc",children:"customer chooses how many ways"})]}),e.jsx("button",{type:"button",className:"rt-switch",role:"switch","aria-checked":Q,"aria-label":"split bill",style:{background:Q?j:"rgba(94,158,255,0.3)"},onClick:()=>Ce(t=>!t),children:e.jsx("span",{className:"rt-knob",style:{transform:Q?"translateX(19px)":"translateX(0)"}})})]})]}),e.jsxs("div",{className:"rt-mode terminal-zone-c",children:[e.jsx("button",{type:"button",className:"rt-send-btn","data-tutorial-id":"retail-terminal-send","aria-label":"send payment","aria-busy":y.isPending,"aria-describedby":y.isPending||m?"rt-sale-status":void 0,disabled:y.isPending||R,title:Pe,onClick:()=>qe(Q),children:We}),(y.isPending||m)&&e.jsx("span",{id:"rt-sale-status",className:`rt-cta-status ${m?"rt-inline-error":"rt-inline-status"}`,role:m?"alert":"status","aria-live":"polite",children:m||"Creating a private payment link…"})]})]}),b==="keypad"&&e.jsxs("div",{className:"rt-mode rt-keypad",children:[e.jsxs("div",{className:"rt-kp-head",children:[e.jsx("button",{type:"button",className:"rt-kp-circle","aria-label":"cancel keypad",onClick:bt,children:e.jsx("svg",{width:"15",height:"15",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"2.2",strokeLinecap:"round",children:e.jsx("path",{d:"M6 6l12 12M18 6 6 18"})})}),e.jsx("button",{type:"button",className:"rt-kp-circle","aria-label":"confirm amount",onClick:gt,children:e.jsx("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"2.2",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"m5 12 5 5L19 8"})})})]}),e.jsx("div",{className:"rt-kp-amt",children:Ct(ze)}),e.jsx("div",{className:"rt-kp-quick",children:Ut.map(t=>e.jsxs("button",{type:"button",className:"rt-kp-quick-btn",onClick:()=>I(t),children:["$",t]},t))}),e.jsx("div",{className:"rt-kp-hint",children:"quick amounts or type it — ✓ starts the sale"}),e.jsx("div",{className:"rt-kp-grid",children:Et.map(t=>{const r=t!=="."&&t!=="<";return e.jsx(Ft,{keyValue:t,className:"rt-kp-key",style:{background:r?j:"transparent",border:r?"none":`1.5px solid ${je}`,color:r?"#FFFFFF":Se,boxShadow:r?"0 14px 22px rgba(0,6,25,0.45)":"none"},onPress:xt},t)})})]}),b==="stock"&&e.jsxs("div",{className:"rt-mode rt-stock",children:[e.jsx("div",{className:"rt-stock-head",children:"Stock — tap a tile to start a sale"}),e.jsx("div",{className:"rt-stock-grid",children:E.isLoading?e.jsx("div",{className:"rt-empty rt-stock-empty",children:"loading…"}):at?e.jsx("div",{className:"rt-stock-empty",children:e.jsx(Ve,{tone:"canvas",title:"Products didn't load",onRetry:it,retrying:E.isFetching,testId:"retail-terminal-products-failed"})}):Be.length===0?e.jsx("div",{className:"rt-empty rt-stock-empty",children:"no products yet — add them on the Stock page"}):Be.map(t=>e.jsxs("button",{type:"button",className:"rt-tile",onClick:()=>ft(t),children:[e.jsx("span",{className:"rt-tile-ico",children:t.emoji||"🏷️"}),e.jsx("span",{className:"rt-tile-name",children:t.name}),e.jsx("span",{className:"rt-tile-price",children:M(L(t.cost))})]},t.id))})]}),b==="split"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-mode terminal-zone-a",children:e.jsxs("div",{className:"rt-amt-row",children:[e.jsx("span",{className:"rt-amt",children:M(u)}),e.jsx("span",{className:"rt-split-lead",children:"split the bill"})]})}),e.jsxs("div",{className:"rt-mode terminal-zone-b",children:[e.jsx("div",{className:"rt-item-name",children:P||"new sale"}),e.jsx("div",{className:"rt-item-hint",children:"customer chooses how many ways to split"}),e.jsxs("div",{className:"rt-split-body",children:[e.jsx("div",{className:"rt-split-chips",children:Ot.map(t=>e.jsxs("button",{type:"button",className:"rt-split-chip",style:Qe(t===he,1.5),onClick:()=>Ze(t),children:[t," ways"]},t))}),e.jsxs("div",{className:"rt-split-each",children:[e.jsx("span",{children:"each pays"}),e.jsx("span",{className:"rt-split-each-amt",children:M(dt)})]}),e.jsx("span",{className:"rt-fee",children:"equal split · customer can enter a different amount on their phone"})]})]}),e.jsxs("div",{className:"rt-mode terminal-zone-c",children:[e.jsx("button",{type:"button",className:"rt-send-btn rt-send-btn-split","aria-label":"send split payment","aria-busy":y.isPending,"aria-describedby":y.isPending||m?"rt-sale-status":void 0,disabled:y.isPending||R,title:Pe,onClick:()=>qe(!0),children:We}),(y.isPending||m)&&e.jsx("span",{id:"rt-sale-status",className:`rt-cta-status ${m?"rt-inline-error":"rt-inline-status"}`,role:m?"alert":"status","aria-live":"polite",children:m||"Creating a private split-payment link…"})]})]}),b==="share"&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-mode terminal-zone-a",children:e.jsx("div",{className:"rt-amt-row",children:e.jsx("span",{className:"rt-amt",children:M(h?h.amount:u)})})}),e.jsxs("div",{className:"rt-mode terminal-zone-b rt-share",children:[e.jsx("div",{className:"rt-share-head",children:"Share payment link"}),h?e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"rt-share-sub",children:h.item+" — anyone with this private link can pay"}),e.jsxs("div",{className:"rt-share-body","aria-live":"polite",children:[e.jsxs("div",{className:"rt-share-link",children:[e.jsxs("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"}),e.jsx("path",{d:"M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"})]}),e.jsx("span",{className:"rt-share-url",title:h.paymentUrl,children:h.paymentUrl.replace(/^https?:\/\//,"")}),e.jsx("button",{type:"button",className:"rt-share-copy",onClick:()=>Oe(h.paymentUrl,"current-sale"),children:Ee==="current-sale"?"copied ✓":"copy link"})]}),e.jsxs("div",{className:"rt-share-actions",children:[e.jsxs("button",{type:"button",className:"rt-share-act",onClick:()=>_e("email",h.paymentUrl),children:[e.jsxs("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("path",{d:"M2 7l10 7 10-7"}),e.jsx("rect",{x:"2",y:"5",width:"20",height:"14",rx:"2"})]}),e.jsx("span",{children:"email"})]}),e.jsxs("button",{type:"button",className:"rt-share-act",onClick:()=>_e("sms",h.paymentUrl),children:[e.jsx("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:e.jsx("path",{d:"M20 4H4v12h4v4l5-4h7z"})}),e.jsx("span",{children:"sms"})]}),e.jsxs("button",{type:"button",className:"rt-share-act",onClick:()=>yt(h.qrCodeUrl),children:[e.jsxs("svg",{width:"14",height:"14",viewBox:"0 0 24 24",fill:"none",stroke:o,strokeWidth:"1.8",strokeLinecap:"round",strokeLinejoin:"round",children:[e.jsx("rect",{x:"4",y:"4",width:"6",height:"6"}),e.jsx("rect",{x:"14",y:"4",width:"6",height:"6"}),e.jsx("rect",{x:"4",y:"14",width:"6",height:"6"}),e.jsx("path",{d:"M14 14h3v3h-3zM20 14v6h-6"})]}),e.jsx("span",{children:"QR code"})]})]}),e.jsx("div",{className:"rt-current-destination",children:h.destination.kind==="no-board"?"private no-board link":`board ${(ye==null?void 0:ye.stoneNumber)??fe} link`})]})]}):e.jsx("div",{className:"rt-share-empty-state","aria-live":"polite",children:m?e.jsx("p",{className:"rt-inline-error",role:"alert",children:m}):e.jsx("p",{role:"status",children:"No current sale link. Start a sale to generate a private payment link."})})]}),e.jsx("div",{className:"rt-mode terminal-zone-c",children:e.jsx("button",{type:"button",className:"rt-new-sale",onClick:()=>Ue("send"),children:"start new sale"})})]})]})]})]})}const _t=`
.rt-body { position:relative; display:flex; height:100%; box-sizing:border-box; padding:26px 46px 0 52px; }

/* ── left column ── */
/* Positioned so the stack shell can be pinned against it. The column's top
   edge is canvas y93 and its bottom is canvas y880, which is what every stack
   offset below is measured from. */
.rt-left { position:relative; flex:0 0 420px; display:flex; flex-direction:column; }
.rt-scope { display:inline-flex; align-items:center; gap:9px; padding:10px 20px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:400; font-size:13.5px; color:${o}; cursor:pointer; transition:background .18s ease; }
.rt-scope:hover { background:rgba(94,158,255,0.08); }
.rt-hero-row { margin-top:22px; display:flex; align-items:flex-start; gap:14px; }
.rt-hero { font-family:'Outfit',sans-serif; font-weight:700; font-size:84px; line-height:0.92; letter-spacing:-0.015em; color:${je}; font-variant-numeric:tabular-nums; }
.rt-hero-pill { margin-top:6px; padding:6px 13px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); font-weight:700; font-size:13px; color:${o}; white-space:nowrap; }
.rt-hero-sub { margin-top:24px; font-weight:300; font-size:17px; color:${Mt}; }
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
.rt-stack-title { display:inline-flex; align-items:center; gap:6px; font-weight:300; font-size:12px; color:${o}; }
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
.rt-row-act { padding:6px 14px; border-radius:9999px; border:1px solid rgba(94,158,255,0.5); background:transparent; font-weight:600; font-size:11px; color:${o}; cursor:pointer; transition:background .15s ease; }
.rt-row-act:hover:not(:disabled) { background:rgba(94,158,255,0.1); }
.rt-row-act:disabled { opacity:0.5; cursor:default; }
.rt-row-act-danger { border-color:rgba(240,101,108,0.5); color:${Ne}; }
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
.rt-edit { font-weight:300; font-size:12px; color:${o}; cursor:pointer; background:transparent; }
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
.rt-wire:hover { border-color:rgba(94,158,255,0.85); color:${o}; }
.rt-boards-toggle.on {
  background:${j}; border-color:transparent; color:${_}; font-weight:700;
}
.rt-boards-toggle.on:hover { background:${j}; color:${_}; }

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
.rt-drop-pick:hover { background:rgba(94,158,255,0.1); color:${o}; }
.rt-drop-pick[aria-checked="true"] { background:rgba(94,158,255,0.16); color:#EAF2FF; font-weight:700; }
.rt-drop-edit {
  flex:0 0 auto; width:26px; height:26px; border-radius:8px; border:none;
  background:transparent; color:rgba(127,178,255,0.5);
  display:grid; place-items:center; cursor:pointer;
  transition:background .15s var(--m-ease-out), color .15s var(--m-ease-out);
}
.rt-drop-edit:hover { background:rgba(94,158,255,0.12); color:${o}; }
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
.rt-drop-create:hover:not(:disabled) { background:rgba(94,158,255,0.1); color:${o}; }
.rt-drop-create:disabled { opacity:0.5; cursor:default; }

@media (prefers-reduced-motion: reduce) {
  .rt-sidepop { animation:none; }
  .rt-drop { transition:none; }
}
.rt-board-hint, .rt-inline-status { font-weight:500; font-size:10.5px; color:rgba(244,246,255,0.48); }
.rt-inline-error { font-weight:600; font-size:10.5px; color:${Ne}; }
.rt-item-name { margin-top:16px; font-weight:300; font-size:16px; color:${T}; text-transform:lowercase; }
.rt-item-hint { margin-top:4px; font-weight:500; font-size:13px; color:rgba(244,246,255,0.5); }
.rt-field { display:flex; flex-direction:column; gap:8px; }
.rt-field-label { font-weight:700; font-size:10px; letter-spacing:0.18em; color:rgba(244,246,255,0.65); }
.rt-name-input { height:50px; border-radius:9999px; border:none; outline:none; background:#fff; padding:0 22px; box-sizing:border-box; color:${Ye}; font-family:'Outfit',sans-serif; font-weight:600; font-size:13.5px; }
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
.rt-kp-quick-btn { padding:9px 20px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:12.5px; color:${o}; cursor:pointer; transition:background .15s ease; }
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
.rt-tile-name { margin-top:auto; font-weight:700; font-size:13px; color:${Ye}; text-transform:lowercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-tile-price { position:absolute; top:14px; right:14px; font-family:'Outfit',sans-serif; font-weight:800; font-size:13.5px; color:${It}; }

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
.rt-share-copy { font-weight:700; font-size:12px; color:${o}; cursor:pointer; flex:0 0 auto; background:transparent; }
.rt-share-actions { display:flex; gap:10px; }
.rt-share-act { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px; height:44px; border-radius:9999px; border:1.5px solid rgba(94,158,255,0.55); background:transparent; font-weight:600; font-size:12.5px; color:${o}; cursor:pointer; transition:background .15s ease; }
.rt-share-act:hover { background:rgba(94,158,255,0.08); }
.rt-current-destination { font-weight:600; font-size:11px; color:rgba(244,246,255,0.48); text-transform:lowercase; }
.rt-new-sale { align-self:flex-start; padding:8px 17px; border-radius:9999px; border:1px solid rgba(94,158,255,0.55); background:transparent; font-weight:700; font-size:11.5px; color:${o}; cursor:pointer; }
.rt-share-empty-state { margin-top:28px; display:flex; flex-direction:column; align-items:flex-start; gap:18px; padding:22px; border-radius:14px; border:1px solid rgba(94,158,255,0.35); font-weight:500; font-size:12.5px; color:rgba(244,246,255,0.62); }
.rt-share-empty-state p { margin:0; }
`;export{nr as default};
