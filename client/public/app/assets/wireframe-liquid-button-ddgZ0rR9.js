import{r as l,j as e}from"./vendor-react-BjxQnpua.js";function g({children:c,onClick:i,disabled:o=!1,busy:t=!1,accent:b="#58ABFF",filledTextColor:h="#040D6D",className:a,style:f,type:w="button",...d}){const[s,n]=l.useState(!1),r=l.useRef(!1);t&&(r.current=!0),l.useEffect(()=>{if(!s||t)return;const m=setTimeout(()=>{n(!1),r.current=!1},r.current?350:900);return()=>clearTimeout(m)},[s,t]);const p=s||t,u=()=>{o||t||(n(!0),i==null||i())};return e.jsxs(e.Fragment,{children:[e.jsx("style",{children:x}),e.jsxs("button",{type:w,disabled:o,onClick:u,className:`wlb${p?" wlb-on":""}${t?" wlb-busy":""}${a?" "+a:""}`,style:{"--wlb-accent":b,"--wlb-fill-text":h,...f},...d,children:[e.jsx("span",{className:"wlb-liquid","aria-hidden":"true",children:e.jsx("svg",{className:"wlb-wave",viewBox:"0 0 240 12",preserveAspectRatio:"none",children:e.jsx("path",{d:"M0 7 Q 15 0 30 7 T 60 7 T 90 7 T 120 7 T 150 7 T 180 7 T 210 7 T 240 7 V 12 H 0 Z",fill:"var(--wlb-accent)"})})}),e.jsx("span",{className:"wlb-label",children:c})]})]})}const x=`
.wlb { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; padding: 14px 36px; border-radius: 999px; background: transparent; border: 1.5px solid var(--wlb-accent); color: var(--wlb-accent); font-family: 'Outfit', system-ui; font-weight: 600; font-size: 15px; white-space: nowrap; cursor: pointer; box-sizing: border-box; transition: color 0.28s ease 0.12s, transform 120ms, opacity 120ms; -webkit-tap-highlight-color: transparent; }
.wlb:active { transform: scale(0.96); }
.wlb:disabled { opacity: 0.65; cursor: default; }
.wlb-on { color: var(--wlb-fill-text); }
/* The liquid — rises from the bottom edge; overshoots the border so no seam shows. */
.wlb-liquid { position: absolute; left: -2px; right: -2px; bottom: -2px; height: 0; background: var(--wlb-accent); transition: height 0.6s cubic-bezier(0.22,1,0.36,1); pointer-events: none; }
.wlb-on .wlb-liquid { height: calc(100% + 4px); }
/* While pending, hold the level below the rim so the wave keeps sloshing. */
.wlb-busy .wlb-liquid { height: 80%; }
/* Wave surface — twice the button width, slid sideways forever for the liquid feel.
   Once the fill tops out it rises above the pill and the overflow clips it away. */
.wlb-wave { position: absolute; bottom: 100%; left: 0; width: 200%; height: 9px; display: block; margin-bottom: -1px; animation: wlbSlosh 1.5s linear infinite; }
.wlb-label { position: relative; z-index: 1; }
@keyframes wlbSlosh { from { transform: translateX(0); } to { transform: translateX(-50%); } }
`;export{g as W};
