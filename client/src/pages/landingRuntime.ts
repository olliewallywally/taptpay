// @ts-nocheck
/*
 * LandingRuntime — ported VERBATIM from the design prototype.
 * All scroll-linking, camera animation, and three.js scene setup live here as
 * readable source (nothing precompiled or inlined). Kept imperative by design:
 * it queries the DOM rendered by LandingPage.tsx via stable element ids.
 * ts-nocheck: this is prototype-fidelity code; typing it would mean rewriting it.
 */
import * as THREE from 'three';

export class LandingRuntime {
  props;
  constructor(props = {}) { this.props = props; }

  init() {
    this._raf = null;
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const map = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
    this.$ = $; this.$$ = $$;
    this._mx = 0; this._my = 0;
    window.addEventListener('pointermove', (e) => {
      this._mx = (e.clientX / window.innerWidth) * 2 - 1;
      this._my = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // wireframe buttons: solid on click
    $$('.tp-wire').forEach((btn) => {
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('data-solid') === '1';
        btn.setAttribute('data-solid', on ? '0' : '1');
        btn.style.background = on ? 'transparent' : '#5E9DFF';
        btn.style.color = on ? '#5E9DFF' : '#040D6D';
      });
    });

    // smooth anchors
    $$('.tp-anchor').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return;
        const t = document.getElementById(href.slice(1));
        if (!t) return;
        e.preventDefault();
        window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
        this.closeMenu && this.closeMenu();
      });
    });

    // mobile menu
    const menu = $('#tp-menu');
    const burger = $('#tp-burger');
    this.closeMenu = () => {
      if (!menu) return;
      menu.style.opacity = '0';
      menu.style.pointerEvents = 'none';
      document.body.style.overflow = '';
    };
    if (burger && menu) {
      burger.addEventListener('click', () => {
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'auto';
        document.body.style.overflow = 'hidden';
      });
      const mc = $('#tp-menu-close');
      if (mc) mc.addEventListener('click', this.closeMenu);
    }
    const syncNavMode = () => {
      const mobile = window.innerWidth < 900;
      const links = $('#tp-nav-links');
      if (links) links.style.display = mobile ? 'none' : 'flex';
      if (burger) burger.style.display = mobile ? 'block' : 'none';
    };
    syncNavMode();
    window.addEventListener('resize', syncNavMode);

    // reveal-on-scroll
    const vh0 = window.innerHeight;
    const revs = $$('.tp-rev');
    revs.forEach((el) => {
      if (el.getBoundingClientRect().top > vh0 * 0.88) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
      }
      el.style.transition = 'opacity .85s ease, transform .85s cubic-bezier(.22,1,.36,1)';
    });
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (en.isIntersecting) {
          const el = en.target;
          setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 60);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.18 });
    revs.forEach((el) => io.observe(el));

    // measurements
    const M = { vh: window.innerHeight, vw: window.innerWidth, doc: 1, storyTop: 0, storyLen: 1, wordsTop: 0, wordsLen: 1 };
    this.M = M;
    const measure = () => {
      M.vh = window.innerHeight; M.vw = window.innerWidth;
      M.doc = document.documentElement.scrollHeight - M.vh;
      const grab = (sel, kTop, kLen) => {
        const el = $(sel);
        if (el) { const r = el.getBoundingClientRect(); M[kTop] = r.top + window.scrollY; M[kLen] = el.offsetHeight - M.vh; }
      };
      grab('#tp-story-wrap', 'storyTop', 'storyLen');
      grab('#tp-words-wrap', 'wordsTop', 'wordsLen');
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('load', measure);

    // cinema
    this.initCinema();

    // main scroll rAF
    const bar = $('#tp-bar');
    const nav = $('#tp-nav');
    const heroContent = $('#tp-hero-content');
    const coinsCanvas = $('#tp-coins');
    const words = $$('.tp-word');
    let lastY = window.scrollY;
    this._scrollVel = 0;
    this._coinsOpacity = 1;

    const tick = () => {
      const y = window.scrollY;
      this._scrollVel = y - lastY; lastY = y;
      const t = performance.now() / 1000;

      if (bar) bar.style.width = (clamp(y / M.doc, 0, 1) * 100).toFixed(2) + '%';

      // nav disappears on scroll
      if (nav) {
        const hidden = y > 90;
        nav.style.opacity = hidden ? '0' : '1';
        nav.style.transform = hidden ? 'translateY(-16px)' : 'translateY(0)';
        nav.style.pointerEvents = hidden ? 'none' : 'auto';
      }

      if (heroContent && y < M.vh * 1.3) {
        heroContent.style.transform = 'translateY(' + (y * 0.16) + 'px)';
        heroContent.style.opacity = String(clamp(1 - y / (M.vh * 0.85), 0, 1));
      }

      // hero coins fade smoothly instead of hard cut
      const co = 1 - map(y, M.vh * 0.55, M.vh * 1.9);
      this._coinsOpacity = co;
      if (coinsCanvas) {
        coinsCanvas.style.opacity = String(co);
        coinsCanvas.style.display = co <= 0.001 ? 'none' : 'block';
      }

      // cinema progress
      const p = clamp((y - M.storyTop) / M.storyLen, 0, 1);
      if (this._cine && y > M.storyTop - M.vh && y < M.storyTop + M.storyLen + M.vh * 2) this._cine(p, t);

      // manifesto words
      const wp = clamp((y - M.wordsTop) / M.wordsLen, 0, 1);
      const wseg = clamp(wp * words.length, 0, words.length - 0.001);
      words.forEach((w, i) => {
        const local = wseg - i;
        const last = i === words.length - 1;
        let op = 0; let ty = 46; let strike = 0; let sc = 1;
        if (local >= -1 && local <= 1.2) {
          const inn = map(local, -0.3, -0.02);
          const out = last ? 0 : map(local, 0.78, 1);
          op = inn * (1 - out);
          ty = (1 - inn) * 46 - out * 52;
          strike = last ? 0 : map(local, 0.5, 0.78);
          if (last) sc = 0.94 + inn * 0.06;
        }
        if (last && local > 1) { op = 1; ty = 0; }
        w.style.opacity = String(op);
        w.style.transform = 'translateY(' + ty + 'px) scale(' + sc + ')';
        const line = w.querySelector('.tp-wline');
        if (line) line.style.width = (strike * 104) + '%';
      });

      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);

    // industries
    this.industryData = {
      property: {
        tag: 'property management', h: 'rent that collects itself.',
        sub: 'set the schedule once. taptpay invoices every cycle, chases every late payment, and marks every dollar the moment it lands.',
        stats: [['$0', 'per transaction'], ['2–10', 'way rent splits'], ['auto', 'reminders, never duplicated']],
        feats: ['recurring rent schedules on autopilot', 'overdue reminders that never double-send', 'utility bills & expenses, sent as payment links', 'gst receipts emailed automatically']
      },
      trades: {
        tag: 'trades & services', h: 'quote → deposit → balance → done.',
        sub: 'the quote and the money are one object. the customer accepting the job is the deposit hitting your account.',
        stats: [['$0', 'per transaction'], ['on accept', 'deposit link presented'], ['auto', 'gst receipts emailed']],
        feats: ['line-item quote builder with deposit toggles', 'quick invoice for callouts — keypad, client, send', 'incl gst / + gst, snapshotted per quote', 'client profiles with full event timelines']
      },
      retail: {
        tag: 'retail & hospitality', h: 'a terminal in every pocket.',
        sub: 'cafés, markets, food trucks — keypad to charge, tap or scan to pay, split the table without maths at the counter.',
        stats: [['$0', 'per transaction, ever'], ['multi', 'stack — unlimited payments at once'], ['2–10', 'way bill splits']],
        feats: ['charge in seconds from the keypad', 'payment boards — customers scan or tap the counter', 'per-person receipts on splits', 'live transaction history & analytics']
      }
    };
    this.renderIndustry(this.props.defaultIndustry ?? 'property', true);
    $$('.tp-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.renderIndustry(tab.getAttribute('data-ind'), false));
    });

    this.initContact();
    this.initMobileLayout();
    // ---- adaptive quality: device tier + live FPS governor ----
    const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
    let tier = 2;
    if (mem <= 4 || cores <= 4 || window.innerWidth < 880) tier = 1;
    if (mem <= 2 || cores <= 2) tier = 0;
    this._tier = tier;
    this._dprCap = [1, 1.5, 2][tier];
    this._blurMax = [1.4, 2.4, 3.5][tier];
    this._prSetters = [];

    this.initPhone3D();
    this.initPhones();
    this.initCoins();

    // Both phone screens are React (landing-phone/LandingPhoneMount) and load
    // themselves behind their own IntersectionObserver, so there is nothing to
    // stagger here any more.

    // governor: sustained jank -> lower render resolution + blur, never touches layout/design
    let gT = performance.now(), gAcc = 0, gN = 0;
    const gov = (now) => {
      requestAnimationFrame(gov);
      const d = now - gT; gT = now;
      if (document.hidden || d <= 0 || d > 250) return;
      gAcc += d; gN++;
      if (gN >= 110) {
        const avg = gAcc / gN; gAcc = 0; gN = 0;
        if (avg > 26 && this._dprCap > 0.9) {
          this._dprCap = Math.max(0.85, this._dprCap - 0.35);
          this._blurMax = Math.max(1.2, this._blurMax - 1);
          this._prSetters.forEach((fn) => { try { fn(); } catch (e) {} });
          if (this._rebuildCoins && !this._coinsCut) { this._coinsCut = true; this._rebuildCoins((this.props.coinDensity ?? 1.4) * 0.72); }
        }
      }
    };
    requestAnimationFrame(gov);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
      else if (!this._raf) { lastY = window.scrollY; this._raf = requestAnimationFrame(tick); }
    });
  }

  // ---------------- cinematic phone journey · true 3d camera rig ----------------
  initCinema() {
    const $ = (s) => document.querySelector(s);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const map = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
    const world = $('#tp-cine-world');
    const rig = $('#tp-cine-rig');
    const turn = $('#tp-cine-turn');
    const glow = $('#tp-cine-glow');
    const glare = $('#tp3-glare');
    const headA = $('#tp-s-head-a');
    const headB = $('#tp-s-head-b');
    const hud = $('#tp-cine-hud');
    const dotsWrap = $('#tp-cine-dots');
    const cap = $('#tp-cine-cap');
    const ghost = Array.from(document.querySelectorAll('#tp-cine-world .tp-gword'));
    if (!world || !rig || !turn) return;

    const EASE = 'cubic-bezier(.6,.04,.16,1)';
    const wallet = '<div style="margin-top:24px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;">' +
      '<span style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:9999px;background:#F4F1E8;"><img src="/assets/Google_Pay_Logo.svg_1773556576322-DufliZL0.png" alt="google pay" style="height:17px;width:auto;display:block;"></span>' +
      '<span style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:9999px;background:rgba(244,241,232,0.08);border:1px solid rgba(244,241,232,0.16);font-family:Outfit;font-weight:600;font-size:13px;color:#F4F1E8;"> pay</span>' +
      '<span style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:9999px;background:rgba(244,241,232,0.08);border:1px solid rgba(244,241,232,0.16);font-family:Outfit;font-weight:600;font-size:13px;color:#F4F1E8;">afterpay</span>' +
      '<span style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:9999px;background:rgba(244,241,232,0.08);border:1px solid rgba(244,241,232,0.16);font-family:Outfit;font-weight:600;font-size:13px;color:#F4F1E8;">mastercard</span>' +
      '<span style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:9999px;background:rgba(244,241,232,0.08);border:1px solid rgba(244,241,232,0.16);font-family:Outfit;font-weight:600;font-size:13px;color:#F4F1E8;">visa</span></div>';

    const B = [
      { k: 'intro' },
      { side: 'L', tag: 'property management', num: '01', mb: 'schedules send the rent requests, reminders chase the stragglers, every dollar reconciles itself.', h: 'rent that <span style="font-weight:500;color:#5E9DFF;">collects itself.</span>', b: 'automated rent &amp; bill collection — schedules send the requests, reminders chase the stragglers, and every dollar reconciles the moment it lands.', bl: ['track every payment link as it goes out', 'tenants pay instantly from their digital wallet', 'auto-generated gst receipts, emailed for you'] },
      { side: 'L', tag: 'property management', num: '02', mb: 'pick the tenant, attach the invoice, send. it gets paid the same way rent does.', h: 'send &amp; track <span style="font-weight:500;color:#5E9DFF;">utility bills.</span>', b: 'water, late fees, cleaning, damages — pick the tenant, attach the invoice, send. it gets paid the same way rent does.', bl: ['one tap from the tenant&rsquo;s profile', 'attach the pdf invoice to the link', 'watch it move: sent → paid'] },
      { side: 'R', tag: 'trades & services', num: '03', mb: 'quote, invoice &amp; collect — the job and the money finally live in one place.', h: 'invoicing &amp; <span style="font-weight:500;color:#5E9DFF;">collecting payments.</span>', b: 'quote, invoice &amp; collect payment digitally — the job and the money finally live in one place.', bl: ['line-item quotes with gst done right', 'auto deposit request on acceptance', 'client profiles with full history'] },
      { side: 'R', tag: 'trades & services', num: '04', mb: 'the moment they accept, the deposit request is already on their screen.', h: 'the quote pays <span style="font-weight:500;color:#5E9DFF;">its own deposit.</span>', b: 'build the quote on site and send it as a secure link — the moment they accept, the deposit request is already on their screen.', bl: ['accepted → deposit link, automatically', 'balance chases itself on completion', 'gst receipt lands in their inbox'] },
      { side: 'L', tag: 'retail & hospitality', num: '05', mb: 'a full point of sale in your pocket. no transaction fees, just your subscription.', h: 'digital p.o.s &amp; <span style="font-weight:500;color:#5E9DFF;">eftpos system.</span>', b: 'throw out your old brick — a full point of sale that lives in your pocket, built for taking payments on the go.', bl: ['multi-stack — unlimited payments at once', 'no transaction fees — flat or percentage', 'live dashboard: everything you need, nothing you don&rsquo;t'] },
      { side: 'L', tag: 'retail & hospitality', num: '06', mb: 'each pays their share on their own card, with their own receipt.', h: 'they split the bill, <span style="font-weight:500;color:#5E9DFF;">not you.</span>', b: 'customers split the bill on their end without you lifting a finger — each pays their share on their own card, with their own receipt.', bl: ['2–10 way splits on any payment', 'track each share as it lands', 'auto gst receipt per person'] },
      { side: 'R', tag: 'the customer side', num: '07', mb: 'no app, no signup — the link opens straight to checkout. every wallet, secured by windcave.', h: 'a secure link. <span style="font-weight:500;color:#5E9DFF;">every wallet.</span>', b: 'no app, no signup — the secure payment link opens straight to checkout. digital wallets, afterpay or card, secured by windcave.', bl: [], wallets: true }
    ];
    const N = B.length;
    const STEP_Y = 880;
    const isMobile = () => window.innerWidth < 880;

    // ---- world geometry: camera stations descending through space ----
    let G = [];
    const geo = () => {
      const mob = isMobile();
      const offX = mob ? 0 : Math.min(430, window.innerWidth * 0.235);
      return B.map((bt, i) => {
        if (i === 0) return { cx: 0, cy: 0, px: 0, py: 0, bx: 0, by: 0 };
        const dirP = bt.side === 'L' ? 1 : -1;
        const cx = dirP * 170;
        const cy = i * STEP_Y;
        return {
          cx, cy,
          px: cx + dirP * (mob ? 46 : offX),
          py: cy + (mob ? 48 : 0),
          bx: cx - dirP * offX * 1.04,
          by: cy
        };
      });
    };

    // ---- world scenery: dust + station orbs (parallax layers) ----
    for (let i = 0; i < 34; i++) {
      const d = document.createElement('span');
      const s = 2 + Math.random() * 3.5;
      d.style.cssText = 'position:absolute;top:0;left:0;width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:rgba(94,157,255,' + (0.1 + Math.random() * 0.28).toFixed(2) + ');transform:translate3d(' + Math.round(-1050 + Math.random() * 2100) + 'px,' + Math.round(-350 + Math.random() * (N * STEP_Y + 700)) + 'px,' + Math.round(-680 + Math.random() * 940) + 'px);';
      world.appendChild(d);
    }
    B.forEach((bt, i) => {
      const o = document.createElement('div');
      const ox = i === 0 ? 430 : (i % 2 ? -1 : 1) * (420 + (i * 67) % 180);
      const oy = i * STEP_Y + (i % 2 ? 150 : -120);
      o.style.cssText = 'position:absolute;top:0;left:0;width:58vw;height:58vw;border-radius:50%;background:radial-gradient(circle,rgba(47,87,255,' + (i === 0 ? 0.26 : 0.2) + ') 0%,rgba(47,87,255,0) 65%);transform:translate3d(' + ox + 'px,' + oy + 'px,-560px) translate(-50%,-50%);';
      world.appendChild(o);
    });

    // ---- text billboards living in the world ----
    const panelHTML = (bt) => {
      let h = '<div style="display:flex;align-items:center;gap:12px;"><span style="font-family:Outfit;font-weight:800;font-size:12px;letter-spacing:0.28em;color:rgba(94,157,255,0.75);">' + bt.num + '</span><span style="font-family:Outfit;font-weight:500;font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:rgba(244,241,232,0.45);">' + bt.tag + '</span></div>';
      h += '<h3 style="margin:14px 0 0;font-family:Outfit;font-weight:300;font-size:clamp(28px,3.4vw,52px);line-height:1.05;letter-spacing:-0.02em;color:#F4F1E8;">' + bt.h + '</h3>';
      h += '<p style="margin:18px 0 0;font-family:Outfit;font-weight:400;font-size:clamp(14px,1.3vw,18px);line-height:1.6;color:rgba(244,241,232,0.62);">' + bt.b + '</p>';
      if (bt.bl && bt.bl.length) {
        h += '<div style="margin-top:22px;display:flex;flex-direction:column;gap:11px;">';
        bt.bl.forEach((li) => {
          h += '<div style="display:flex;align-items:flex-start;gap:12px;"><span style="flex:0 0 auto;margin-top:2px;color:#5E9DFF;font-family:Outfit;font-weight:700;font-size:14px;">&gt;</span><span style="font-family:Outfit;font-weight:400;font-size:clamp(13px,1.15vw,16px);line-height:1.5;color:rgba(244,241,232,0.78);">' + li + '</span></div>';
        });
        h += '</div>';
      }
      if (bt.wallets) h += wallet;
      return h;
    };
    const mPanelHTML = (bt) => {
      const cen = bt.wallets ? 'justify-content:center;' : '';
      let h = '<div style="display:flex;align-items:center;gap:10px;' + cen + '"><span style="font-family:Outfit;font-weight:800;font-size:11px;letter-spacing:0.26em;color:rgba(94,157,255,0.85);">' + bt.num + '</span><span style="font-family:Outfit;font-weight:500;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(244,241,232,0.5);">' + bt.tag + '</span></div>';
      h += '<h3 style="margin:10px 0 0;font-family:Outfit;font-weight:300;font-size:23px;line-height:1.08;letter-spacing:-0.02em;color:#F4F1E8;text-shadow:0 2px 18px rgba(2,5,46,0.85);">' + bt.h + '</h3>';
      h += '<p style="margin:9px 0 0;font-family:Outfit;font-weight:400;font-size:13px;line-height:1.5;color:rgba(244,241,232,0.8);text-shadow:0 1px 12px rgba(2,5,46,0.9);">' + (bt.mb || bt.b) + '</p>';
      if (bt.wallets) {
        const pill = (inner) => '<span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;height:30px;padding:0 11px;border-radius:9999px;background:#F4F1E8;flex:0 0 auto;">' + inner + '</span>';
        const applePay = '<svg viewBox="0 0 384 512" style="height:13px;width:auto;display:block;" aria-hidden="true"><path fill="#000" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.7-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg><span style="font-family:-apple-system,Outfit,sans-serif;font-weight:600;font-size:13px;color:#000;line-height:1;">Pay</span>';
        const mc = '<svg viewBox="0 0 48 30" style="height:16px;width:auto;display:block;" aria-hidden="true"><circle cx="15" cy="15" r="15" fill="#EB001B"/><circle cx="33" cy="15" r="15" fill="#F79E1B"/><path d="M24 3 A15 15 0 0 1 24 27 A15 15 0 0 1 24 3 Z" fill="#FF5F00"/></svg>';
        const visa = '<span style="font-family:Outfit,sans-serif;font-weight:800;font-style:italic;font-size:13px;letter-spacing:0.04em;color:#1434CB;line-height:1;">VISA</span>';
        const afterpay = '<span style="font-family:Outfit,sans-serif;font-weight:700;font-size:12px;letter-spacing:-0.01em;color:#000;line-height:1;">afterpay</span>';
        const gpay = '<img src="/assets/Google_Pay_Logo.svg_1773556576322-DufliZL0.png" alt="google pay" style="height:13px;width:auto;display:block;">';
        h += '<div style="margin-top:16px;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:nowrap;">' + pill(applePay) + pill(gpay) + pill(afterpay) + pill(mc) + pill(visa) + '</div>';
      }
      return h;
    };
    const bills = B.map((bt, i) => {
      if (!i) return null;
      const placer = document.createElement('div');
      placer.style.cssText = 'position:absolute;top:0;left:0;width:min(500px,38vw);pointer-events:none;';
      const card = document.createElement('div');
      card.style.cssText = 'opacity:0;will-change:transform,opacity;';
      card.innerHTML = panelHTML(bt);
      placer.appendChild(card);
      world.appendChild(placer);
      return placer;
    });
    const setPlaces = () => {
      G = geo();
      bills.forEach((b, i) => {
        if (!b) return;
        b.style.display = isMobile() ? 'none' : 'block';
        b.style.transform = 'translate3d(' + G[i].bx + 'px,' + G[i].by + 'px,-40px) translate(-50%,-50%)';
      });
    };
    setPlaces();

    // ---- ghost word world placement ----
    const GPOSD = [[-620, -210, -340], [500, -300, -200], [-560, 150, -430], [520, 230, -280]];
    const GPOSM = [[112, -4, 52], [88, 78, 44], [84, 170, 48], [106, 260, 42]];
    let gBase = [];
    const placeGhost = () => {
      const P0 = isMobile() ? GPOSM : GPOSD;
      gBase = ghost.map((g, i) => {
        const p = P0[i] || [0, 0, -300];
        g.style.fontSize = isMobile() ? '26px' : 'clamp(34px,5.2vw,80px)';
        g.style.color = isMobile() ? '#5E9DFF' : 'rgba(94,157,255,0.15)';
        const b = 'translate3d(' + p[0] + 'px,' + p[1] + 'px,' + p[2] + 'px) translate(-50%,-50%)';
        g.style.transform = b;
        return b;
      });
    };
    placeGhost();

    // ---- camera ----
    let camX = 0, camY = 0, camZ = -260;
    let worldAnim = null;
    let blurAnim = null;
    const vpEl = document.getElementById('tp-cine-vp');
    world.style.transform = 'translate3d(0px,0px,-260px)';
    const camGo = (tx, ty, tz, ms, rollDir) => {
      if (worldAnim) { try { worldAnim.cancel(); } catch (e) {} worldAnim = null; }
      const to = 'translate3d(' + (-tx) + 'px,' + (-ty) + 'px,' + tz + 'px)';
      if (!ms) { world.style.transform = to; camX = tx; camY = ty; camZ = tz; return; }
      const from = 'translate3d(' + (-camX) + 'px,' + (-camY) + 'px,' + camZ + 'px)';
      const mid = 'translate3d(' + (-(camX + tx) / 2) + 'px,' + (-(camY + ty) / 2) + 'px,' + (tz - 170) + 'px) rotateZ(' + (rollDir * 1.5) + 'deg) rotateX(' + (ty > camY ? 2.4 : -2.4) + 'deg)';
      world.style.transform = to;
      worldAnim = world.animate(
        [{ transform: from }, { transform: mid, offset: 0.5 }, { transform: to }],
        { duration: ms, easing: EASE }
      );
      // motion blur during the flight — peaks mid-transit, sharp at rest
      if (vpEl) {
        if (blurAnim) { try { blurAnim.cancel(); } catch (e) {} }
        const bm = this._blurMax ?? 3.5;
        blurAnim = vpEl.animate(
          [
            { filter: 'blur(0px)' },
            { filter: 'blur(' + (bm * 0.57).toFixed(2) + 'px)', offset: 0.3 },
            { filter: 'blur(' + bm.toFixed(2) + 'px)', offset: 0.5 },
            { filter: 'blur(' + (bm * 0.43).toFixed(2) + 'px)', offset: 0.75 },
            { filter: 'blur(0px)' }
          ],
          { duration: ms, easing: 'linear' }
        );
      }
      camX = tx; camY = ty; camZ = tz;
    };

    // ---- phone rig ----
    const rigTo = (x, y, ms) => {
      rig.style.transition = ms ? 'transform ' + ms + 'ms ' + EASE : 'none';
      rig.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%)';
    };
    const turnTo = (deg, ms) => {
      if (this._p3) this._p3.setRot(deg, ms);
    };
    const sweep = () => {
      if (!glare) return;
      glare.style.animation = 'none';
      void glare.offsetWidth;
      glare.style.animation = 'tpGlare 1.5s cubic-bezier(.5,.06,.3,1) 1';
    };

    // The screen itself is a React component (landing-phone/), driven by the
    // same scroll progress as the camera. This used to be an iframe whose
    // workflows were faked by setting its hash and, after a fixed 1750 ms,
    // regex-matching its buttons and clicking the first hit — both of which
    // this beat list no longer needs to know anything about.

    // ---- progress dots ----
    const dots = B.map(() => {
      const d = document.createElement('span');
      d.style.cssText = 'width:26px;height:4px;border-radius:2px;background:rgba(244,241,232,0.15);transition:background .3s ease;';
      dotsWrap.appendChild(d);
      return d;
    });

    let cur = -1;
    let rot = 0;
    let hideT = null, showT = null, glareT = null;
    let visCard = null;

    const popIn = (el) => { el.style.animation = 'tpPopIn .75s cubic-bezier(.34,1.45,.5,1) forwards'; };
    const popOut = (el) => { el.style.animation = 'tpPopOut .45s cubic-bezier(.5,.06,.4,1) forwards'; };

    const applyBeat = (i, prev) => {
      const bt = B[i];
      const mob = isMobile();
      const g = G[i];
      clearTimeout(hideT); clearTimeout(showT); clearTimeout(glareT);

      const rollDir = i === 0 ? 0 : (bt.side === 'L' ? -1 : 1);
      camGo(g.cx, g.cy, 0, i === 0 ? 950 : 1300, rollDir);
      rigTo(g.px, g.py, 1150);
      rot += (i >= prev ? 360 : -360);
      turnTo(rot, 1150);
      if (glow) glow.style.opacity = i === 0 ? '0.8' : '0.55';

      glareT = setTimeout(sweep, 1080);

      if (headB) headB.style.opacity = i === 0 ? headB.style.opacity : '0';
      if (headA) headA.style.opacity = i === 0 ? headA.style.opacity : '0';
      if (i !== 0) ghost.forEach((gw) => { gw.style.opacity = '0'; });
      if (cap) cap.style.opacity = i === 0 ? '0' : '1';

      // text: world billboards on desktop, HUD on mobile
      if (mob) {
        if (visCard) { popOut(visCard); visCard = null; }
        if (i === 0) {
          popOut(hud); hud.style.pointerEvents = 'none';
          hideT = setTimeout(() => { hud.style.display = 'none'; }, 460);
        } else {
          hud.style.display = 'block';
          if (bt.wallets) { hud.style.bottom = 'auto'; hud.style.top = '8vh'; hud.style.width = 'calc(100vw - 28px)'; hud.style.textAlign = 'center'; }
          else { hud.style.bottom = 'auto'; hud.style.top = '11vh'; hud.style.width = 'min(68vw,300px)'; hud.style.textAlign = ''; }
          hud.style.maxHeight = '44vh';
          hud.style.padding = '0';
          if (bt.side === 'R') { hud.style.right = '14px'; hud.style.left = 'auto'; }
          else { hud.style.left = '14px'; hud.style.right = 'auto'; }
          popOut(hud);
          showT = setTimeout(() => {
            hud.innerHTML = mPanelHTML(bt);
            popIn(hud);
            hud.style.pointerEvents = 'auto';
          }, 480);
        }
      } else {
        hud.style.display = 'none';
        const card = i === 0 ? null : bills[i].firstElementChild;
        if (visCard && visCard !== card) popOut(visCard);
        if (card) {
          if (visCard === card) popOut(card);
          showT = setTimeout(() => { popIn(card); }, 560);
          visCard = card;
        } else {
          visCard = null;
        }
      }

      dots.forEach((d, di) => { d.style.background = di === i ? '#5E9DFF' : 'rgba(244,241,232,0.15)'; });
    };
    this._applyCineBeat = applyBeat;

    window.addEventListener('resize', () => { setPlaces(); placeGhost(); if (cur >= 0) applyBeat(cur, cur); });

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    this._cine = (p, t) => {
      const zone = clamp(Math.floor(p * N), 0, N - 1);
      if (zone !== cur) {
        const prev = cur;
        cur = zone;
        applyBeat(zone, prev < 0 ? 0 : prev);
      }
      if (zone === 0) {
        const rp = easeOut(map(p, 0.004, 1 / N * 0.82));
        rigTo(0, (1 - rp) * 900, 0);
        turnTo(-540 + rp * 540, 0);
        rot = 0;
        if (worldAnim) { try { worldAnim.cancel(); } catch (e) {} worldAnim = null; }
        camZ = -260 + rp * 260; camX = 0; camY = 0;
        world.style.transform = 'translate3d(0px,0px,' + camZ + 'px)';
        if (glow) glow.style.opacity = String(rp * 0.85);
        if (headA) {
          const aOut = map(rp, 0.42, 0.62);
          headA.style.opacity = String(1 - aOut);
          headA.style.transform = 'translateY(' + (-aOut * 26) + 'px)';
        }
        if (headB) {
          const bIn = map(rp, 0.6, 0.82);
          headB.style.opacity = String(bIn);
          headB.style.transform = 'translateY(' + ((1 - bIn) * 26) + 'px)';
        }
        const mob0 = isMobile();
        const ebk = (x) => { const c1 = 1.70158, c3 = c1 + 1, u = x - 1; return 1 + c3 * u * u * u + c1 * u * u; };
        ghost.forEach((gw, gi) => {
          const gIn = map(rp, 0.5 + gi * 0.07, mob0 ? 0.68 + gi * 0.07 : 0.62 + gi * 0.07);
          const gOut = map(p, 1 / N * 0.86, 1 / N * 0.99);
          if (mob0) {
            const k = ebk(gIn);
            gw.style.opacity = String(gIn * (1 - gOut) * 0.7);
            gw.style.transform = gBase[gi] + ' translateY(' + ((1 - k) * 52 - gOut * 60 - Math.sin(t * 0.9 + gi * 1.7) * 5) + 'px) scale(' + (0.72 + 0.28 * k).toFixed(3) + ')';
          } else {
            gw.style.opacity = String(gIn * (1 - gOut) * (0.55 + 0.45 * Math.sin(t * 1.3 + gi * 2)));
            gw.style.transform = gBase[gi] + ' translateY(' + ((1 - gIn) * 40 - gOut * 60 - Math.sin(t * 0.9 + gi * 1.7) * 6) + 'px)';
          }
        });
      }
    };
  }

  // ---------------- industries ----------------
  renderIndustry(key, instant) {
    const d = this.industryData[key] || this.industryData.property;
    const $ = this.$;
    const panel = $('#tp-ind-panel');
    const apply = () => {
      const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
      set('#tp-ind-tag', d.tag); set('#tp-ind-h', d.h); set('#tp-ind-sub', d.sub);
      set('#tp-ind-s1v', d.stats[0][0]); set('#tp-ind-s1l', d.stats[0][1]);
      set('#tp-ind-s2v', d.stats[1][0]); set('#tp-ind-s2l', d.stats[1][1]);
      set('#tp-ind-s3v', d.stats[2][0]); set('#tp-ind-s3l', d.stats[2][1]);
      const feats = $('#tp-ind-feats');
      if (feats) {
        feats.innerHTML = '';
        d.feats.forEach((f) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;';
          row.innerHTML = '<span style="flex:0 0 auto;width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(94,157,255,0.6);display:flex;align-items:center;justify-content:center;color:#5E9DFF;font-size:12px;margin-top:1px;">✓</span><span style="font-family:Outfit;font-weight:400;font-size:clamp(14px,1.2vw,17px);line-height:1.55;color:rgba(244,241,232,0.75);">' + f + '</span>';
          feats.appendChild(row);
        });
      }
      // The phone beside this copy is React and picks its own scene off the
      // selected tab (landing-page.tsx reads [data-ind]); this method owns the
      // copy only.
      document.querySelectorAll('.tp-tab').forEach((t) => {
        const on = t.getAttribute('data-ind') === key;
        t.style.background = on ? '#5E9DFF' : 'transparent';
        t.style.color = on ? '#040D6D' : 'rgba(244,241,232,0.6)';
      });
    };
    if (instant || !panel) { apply(); return; }
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(14px)';
    setTimeout(() => {
      apply();
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
    }, 360);
  }

  // ---------------- contact morph ----------------
  initContact() {
    const $ = this.$;
    const shell = $('#tpc-form'); const head = $('#tpc-head'); const body = $('#tpc-body'); const plus = $('#tpc-plus');
    if (!shell || !head) return;
    const EASE = 'cubic-bezier(.22,1,.36,1)';
    let open = false;
    head.addEventListener('click', () => {
      open = !open;
      if (open) {
        shell.style.transition = 'width .42s ' + EASE + ', height .55s ' + EASE + ' .34s, border-radius .42s ease, background .4s ease';
        if (body) body.style.transition = 'opacity .35s ease .82s';
        shell.style.width = 'min(480px,92vw)';
        shell.style.height = '452px';
        shell.style.borderRadius = '28px';
        shell.style.background = 'rgba(244,241,232,0.04)';
        if (body) { body.style.opacity = '1'; body.style.pointerEvents = 'auto'; }
        if (plus) plus.style.transform = 'rotate(45deg)';
      } else {
        shell.style.transition = 'width .42s ' + EASE + ' .42s, height .5s ' + EASE + ', border-radius .42s ease .42s, background .4s ease .42s';
        if (body) body.style.transition = 'opacity .18s ease';
        if (body) { body.style.opacity = '0'; body.style.pointerEvents = 'none'; }
        shell.style.width = '248px';
        shell.style.height = '58px';
        shell.style.borderRadius = '9999px';
        shell.style.background = 'rgba(244,241,232,0.05)';
        if (plus) plus.style.transform = 'rotate(0deg)';
      }
    });
    const send = $('#tpc-send');
    if (send) send.addEventListener('click', () => {
      const f = $('#tpc-fields'); const t = $('#tpc-thanks');
      if (f) f.style.display = 'none';
      if (t) t.style.display = 'flex';
    });
  }

  // ---------------- live app phones ----------------
  initPhones() {
    const scales = Array.from(document.querySelectorAll('.tp-phone-scale'));
    const fit = () => scales.forEach((sc) => {
      const f = sc.querySelector('.tp-app-frame');
      if (!f) return;
      const w = sc.clientWidth;
      if (w > 0) f.style.transform = 'scale(' + (w / 390) + ')';
    });
    fit();
    window.addEventListener('resize', fit);
    setTimeout(fit, 400); setTimeout(fit, 1500); setTimeout(fit, 4000);
    // The screen's own pointer-events are React's (landing-page.tsx watches this
    // same click), so this handler owns nothing but the button's own appearance.
    // Two writers on one inline style is how they would drift apart.
    document.querySelectorAll('.tp-phone-live').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const live = btn.getAttribute('data-live') === '1';
        btn.setAttribute('data-live', live ? '0' : '1');
        btn.textContent = live ? 'try it live' : 'exit live demo';
        btn.style.background = live ? 'transparent' : '#5E9DFF';
        btn.style.color = live ? '#5E9DFF' : '#040D6D';
      });
    });
    document.querySelectorAll('.tp-tilt').forEach((t) => {
      const inner = t.querySelector('.tp-tilt-inner');
      if (!inner) return;
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        inner.style.transform = 'rotateY(' + (x * 16) + 'deg) rotateX(' + (-y * 12) + 'deg)';
      });
      t.addEventListener('pointerleave', () => { inner.style.transform = 'rotateY(0deg) rotateX(0deg)'; });
    });
  }

  // ---------------- mobile layout: compact hero + industries reveal tab ----------------
  initMobileLayout() {
    if (window.innerWidth >= 880) return;
    const $ = (s) => document.querySelector(s);

    // ---- hero: compact, anchored bottom-left, everything left-aligned ----
    const hero = $('#tp-hero');
    const hc = $('#tp-hero-content');
    if (hero) { hero.style.alignItems = 'flex-end'; hero.style.minHeight = '102vh'; }
    if (hc) {
      hc.style.padding = '0 20px 88px';
      const ctasRef = hc.children[3], railRef = hc.children[4];
      const eyebrow = hc.children[0];
      if (eyebrow) {
        eyebrow.style.height = 'auto';
        eyebrow.style.margin = '0';
        eyebrow.style.position = 'absolute';
        eyebrow.style.top = '72px';
        eyebrow.style.left = '20px';
        eyebrow.style.zIndex = '6';
        eyebrow.querySelectorAll('span').forEach((s, i) => {
          s.style.position = 'static'; s.style.top = 'auto'; s.style.left = 'auto';
          if (i === 0) s.style.width = '22px';
          else { s.style.fontSize = '10px'; s.style.letterSpacing = '0.24em'; s.style.height = 'auto'; }
        });
        if (hero) hero.appendChild(eyebrow);
      }
      const h1 = hc.querySelector('h1');
      if (h1) { h1.style.fontSize = 'clamp(40px,11.4vw,54px)'; h1.style.lineHeight = '1.0'; }
      const p = hc.querySelector('p');
      if (p) {
        p.innerHTML = 'your phone becomes the terminal — <span style="color:#F4F1E8;font-weight:500;">and the whole billing system behind it.</span> no hardware, ever.';
        p.style.margin = '16px 0 0'; p.style.fontSize = '15px'; p.style.lineHeight = '1.55'; p.style.maxWidth = '24em';
      }
      const ctas = ctasRef;
      if (ctas) {
        ctas.style.marginTop = '24px'; ctas.style.flexDirection = 'column'; ctas.style.alignItems = 'flex-start'; ctas.style.gap = '12px';
        const cta1 = ctas.children[0];
        if (cta1) {
          cta1.textContent = 'get started';
          cta1.setAttribute('href', '#tp-contact');
          cta1.style.padding = '10px 20px';
          cta1.style.fontSize = '13px';
        }
        if (ctas.children[1]) { ctas.children[1].style.padding = '2px 0'; ctas.children[1].style.fontSize = '13px'; }
      }
      const rail = railRef;
      if (rail) {
        rail.style.marginTop = '26px'; rail.style.fontSize = '10px'; rail.style.letterSpacing = '0.12em'; rail.style.maxWidth = '100%';
        rail.style.flexDirection = 'column'; rail.style.alignItems = 'flex-start'; rail.style.gap = '7px';
        rail.innerHTML = '<div style="display:flex;align-items:center;gap:10px;white-space:nowrap;"><span>apple pay</span><span style="opacity:.4;">·</span><span>google pay</span><span style="opacity:.4;">·</span><span>afterpay</span></div>' +
          '<div style="display:flex;align-items:center;gap:10px;white-space:nowrap;"><span>credit &amp; debit cards</span><span style="opacity:.4;">·</span><span>same-day payouts by windcave</span></div>';
      }
    }

    const cap0 = $('#tp-cine-cap');
    if (cap0) cap0.style.display = 'none';

    // ---- industries: phone hidden behind a right-edge reveal tab ----
    const sec = $('#tp-industries');
    const panel = $('#tp-ind-panel');
    const copy = panel ? panel.children[0] : null;
    const phoneCol = panel ? panel.children[1] : null;
    if (!sec || !panel || !copy || !phoneCol) return;

    phoneCol.style.display = 'none';
    phoneCol.style.flex = '1 1 100%';
    phoneCol.style.opacity = '0';
    phoneCol.style.transform = 'translateX(80px)';
    phoneCol.style.transition = 'opacity .45s ease, transform .55s cubic-bezier(.34,1.3,.5,1)';
    copy.style.transition = 'opacity .32s ease, transform .32s ease';

    const ph = phoneCol.querySelector('.tp-phone');
    if (ph) { ph.style.top = '0'; ph.style.height = 'auto'; ph.style.width = 'min(64vw,260px)'; }
    const lv = phoneCol.querySelector('.tp-phone-live');
    if (lv) { lv.style.position = 'static'; lv.style.top = 'auto'; lv.style.left = 'auto'; lv.style.display = 'block'; lv.style.margin = '16px auto 0'; }

    const col = phoneCol.firstElementChild || phoneCol;
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.textContent = 'hide app';
    hideBtn.style.cssText = 'display:block;padding:10px 20px;border-radius:9999px;border:1.5px solid rgba(244,241,232,0.3);background:transparent;color:rgba(244,241,232,0.7);font-family:Outfit,sans-serif;font-weight:500;font-size:13px;cursor:pointer;';
    col.appendChild(hideBtn);

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = 'see it live';
    tab.style.cssText = 'position:absolute;right:0;top:36%;z-index:6;writing-mode:vertical-rl;padding:18px 11px;border-radius:14px 0 0 14px;border:1.5px solid #5E9DFF;border-right:none;background:rgba(94,157,255,0.16);color:#5E9DFF;font-family:Outfit,sans-serif;font-weight:600;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;cursor:pointer;backdrop-filter:blur(6px);transition:transform .45s cubic-bezier(.34,1.3,.5,1),opacity .3s ease;';
    sec.appendChild(tab);

    let open = false, animT = null;
    const reveal = () => {
      if (open) return; open = true;
      clearTimeout(animT);
      tab.style.transform = 'translateX(110%)'; tab.style.opacity = '0'; tab.style.pointerEvents = 'none';
      copy.style.opacity = '0'; copy.style.transform = 'translateX(-28px)';
      animT = setTimeout(() => {
        copy.style.display = 'none';
        phoneCol.style.display = 'flex';
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => requestAnimationFrame(() => {
          phoneCol.style.opacity = '1'; phoneCol.style.transform = 'translateX(0)';
        }));
      }, 340);
    };
    const hide = () => {
      if (!open) return; open = false;
      clearTimeout(animT);
      phoneCol.style.opacity = '0'; phoneCol.style.transform = 'translateX(80px)';
      animT = setTimeout(() => {
        phoneCol.style.display = 'none';
        copy.style.display = 'block';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          copy.style.opacity = '1'; copy.style.transform = 'translateX(0)';
        }));
        tab.style.transform = 'translateX(0)'; tab.style.opacity = '1'; tab.style.pointerEvents = 'auto';
      }, 400);
    };
    tab.addEventListener('click', reveal);
    hideBtn.addEventListener('click', hide);
  }

  // ---------------- true-3d phone (webgl body + projection-matched screen) ----------------
  initPhone3D() {
    const canvas = document.getElementById('tp3-gl');
    const box = document.getElementById('tp3');
    const spin = document.getElementById('tp3-spin');
    const face = document.getElementById('tp3-face');
    const wrapEl = document.getElementById('tp-story-wrap');
    if (!canvas || !box || !spin || !face || !THREE) return;
    const P = 1100; // must equal #tp3-css perspective

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: (this._tier ?? 2) > 0, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._dprCap ?? 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 40, 6000);
    camera.position.set(0, 0, P);

    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x040a2e, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(500, 620, 900); scene.add(key);
    const rimL = new THREE.PointLight(0x5e9dff, 2.4, 5000); rimL.position.set(-720, 180, -420); scene.add(rimL);
    const fill = new THREE.PointLight(0x2f57ff, 0.9, 5000); fill.position.set(320, -340, 720); scene.add(fill);
    const sweep = new THREE.DirectionalLight(0xdfe9ff, 0.7); scene.add(sweep);

    const loader = new THREE.TextureLoader();
    const mkTex = (url) => { const t = loader.load(url, () => { frontM.needsUpdate = true; backM.needsUpdate = true; }); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const frontM = new THREE.MeshStandardMaterial({ map: mkTex('/assets/shell-front.webp'), transparent: true, alphaTest: 0.08, metalness: 0.35, roughness: 0.42 });
    const backM = new THREE.MeshStandardMaterial({ map: mkTex('/assets/shell-back.webp'), transparent: true, alphaTest: 0.08, metalness: 0.35, roughness: 0.42 });
    const rimM = new THREE.MeshStandardMaterial({ color: 0x8ea9dd, metalness: 0.95, roughness: 0.3 });
    const capM = new THREE.MeshStandardMaterial({ color: 0x0a1035, metalness: 0.6, roughness: 0.55 });

    const group = new THREE.Group();
    scene.add(group);

    if (window.innerWidth < 880) box.style.width = 'clamp(150px,22.5vh,240px)';
    const w0 = box.offsetWidth || 280, h0 = box.offsetHeight || (w0 / 473 * 969);
    const t = w0 * 0.11, R = w0 * 0.135;
    const rr = (w, h, r) => {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
      s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
      s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
      return s;
    };
    const slabG = new THREE.ExtrudeGeometry(rr(w0 - 3, h0 - 3, R), { depth: t, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.4, bevelSegments: 3, curveSegments: 24 });
    slabG.translate(0, 0, -t / 2);
    group.add(new THREE.Mesh(slabG, [capM, rimM]));
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(w0, h0), frontM); fp.position.z = t / 2 + 0.8; group.add(fp);
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(w0 * 1.017, h0), backM); bp.rotation.y = Math.PI; bp.position.z = -(t / 2 + 0.8); group.add(bp);
    const btn = (side, fromTop, hFrac) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(4.5, h0 * hFrac, t * 0.5), rimM);
      m.position.set(side * (w0 / 2 - 0.5), h0 * (0.5 - fromTop), 0);
      group.add(m);
    };
    btn(1, 0.26, 0.105); btn(-1, 0.155, 0.045); btn(-1, 0.225, 0.062); btn(-1, 0.305, 0.062);

    const tz = t / 2 + 1;
    let scl = 1;
    const resize = () => {
      const cw = canvas.offsetWidth || 1, ch = canvas.offsetHeight || 1;
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.fov = 2 * Math.atan((ch / 2) / P) * 180 / Math.PI;
      camera.updateProjectionMatrix();
      scl = (box.offsetWidth || w0) / w0;
      group.scale.setScalar(scl);
    };
    resize();
    window.addEventListener('resize', resize);
    if (this._prSetters) this._prSetters.push(() => { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._dprCap)); resize(); });

    // cubic-bezier(.6,.04,.16,1) — same curve as the camera flights
    const bez = (p1x, p1y, p2x, p2y) => {
      const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
      const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
      const xAt = (u) => ((ax * u + bx) * u + cx) * u;
      const dxAt = (u) => (3 * ax * u + 2 * bx) * u + cx;
      return (x) => {
        let u = x;
        for (let i = 0; i < 6; i++) { const e = xAt(u) - x, d = dxAt(u); if (Math.abs(e) < 1e-4 || d === 0) break; u -= e / d; }
        return ((ay * u + by) * u + cy) * u;
      };
    };
    const ease = bez(0.6, 0.04, 0.16, 1);

    let rot = -540, anim = null;
    const setRot = (deg, ms) => {
      if (!ms) { rot = deg; anim = null; return; }
      anim = { from: rot, to: deg, start: performance.now(), dur: ms };
    };

    let skip = 0;
    const tick = () => {
      requestAnimationFrame(tick);
      if (document.hidden) return;
      if ((this._tier ?? 2) === 0 && (skip = 1 - skip)) return;
      const now = performance.now();
      if (anim) {
        const k = (now - anim.start) / anim.dur;
        if (k >= 1) { rot = anim.to; anim = null; }
        else rot = anim.from + (anim.to - anim.from) * ease(k);
      }
      const r = wrapEl ? wrapEl.getBoundingClientRect() : null;
      if (r && (r.bottom < -window.innerHeight * 0.6 || r.top > window.innerHeight * 1.6)) return;
      const rx = Math.sin(now * 0.00055) * 1.1;
      group.rotation.x = -rx * Math.PI / 180;
      group.rotation.y = rot * Math.PI / 180;
      sweep.position.set(Math.sin(rot * Math.PI / 180 + 0.9) * 800, 260, Math.cos(rot * Math.PI / 180 + 0.9) * 800);
      spin.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + rot + 'deg)';
      face.style.transform = 'translateZ(' + (tz * scl) + 'px)';
      renderer.render(scene, camera);
    };
    tick();

    this._p3 = { setRot };
  }

  // ---------------- three.js hero coins (mixed faces) ----------------
  initCoins() {
    const canvas = document.querySelector('#tp-coins');
    const hero = document.querySelector('#tp-hero');
    if (!canvas || !hero || !THREE) return;
    const reduced = this.props.reducedMotion ?? false;
    const density = this.props.coinDensity ?? 1.4;
    const isMobile = window.innerWidth < 768;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: (this._tier ?? 2) > 0, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._dprCap ?? 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 26);

    scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x02063a, 0.85));
    const key = new THREE.DirectionalLight(0xdfe9ff, 0.75); key.position.set(6, 10, 8); scene.add(key);
    const rim = new THREE.PointLight(0x5e9dff, 1.0, 60); rim.position.set(-10, -4, 8); scene.add(rim);
    const deep = new THREE.PointLight(0x2f57ff, 0.8, 60); deep.position.set(10, -8, -6); scene.add(deep);

    // face factory: kind 'glyph' = t.  |  kind 'word' = full taptpay. wordmark
    const mkFace = (kind) => {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d');
      const rad = g.createRadialGradient(200, 190, 40, 256, 256, 300);
      rad.addColorStop(0, '#2445b8'); rad.addColorStop(0.55, '#152e96'); rad.addColorStop(1, '#091862');
      const drawText = (ctx, fill) => {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (kind === 'glyph') {
          ctx.font = '900 250px Larken, Georgia, serif';
          ctx.fillStyle = fill; ctx.fillText('t.', 256, 266);
        } else {
          const upr = '900 96px Larken, Georgia, serif';
          const ita = 'italic 900 96px Larken, Georgia, serif';
          ctx.font = upr; const w1 = ctx.measureText('tapt').width;
          ctx.font = ita; const w2 = ctx.measureText('pay.').width;
          const total = w1 + w2;
          const x0 = 256 - total / 2;
          ctx.textAlign = 'left';
          ctx.fillStyle = fill;
          ctx.font = upr; ctx.fillText('tapt', x0, 268);
          ctx.font = ita; ctx.fillText('pay.', x0 + w1, 268);
          ctx.textAlign = 'center';
        }
      };
      const draw = () => {
        g.clearRect(0, 0, 512, 512);
        g.fillStyle = rad; g.fillRect(0, 0, 512, 512);
        g.strokeStyle = 'rgba(148,178,238,0.55)'; g.lineWidth = 10;
        g.beginPath(); g.arc(256, 256, 225, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(110,148,230,0.28)'; g.lineWidth = 3;
        g.beginPath(); g.arc(256, 256, 205, 0, Math.PI * 2); g.stroke();
        g.save(); g.translate(5, 9); drawText(g, 'rgba(10,20,90,0.55)'); g.restore();
        drawText(g, '#a7c2f0');
      };
      draw();
      const tex = new THREE.CanvasTexture(c);
      const b = document.createElement('canvas'); b.width = b.height = 512;
      const bg2 = b.getContext('2d');
      const drawBump = () => {
        bg2.filter = 'none';
        bg2.fillStyle = '#000'; bg2.fillRect(0, 0, 512, 512);
        // blurred pass = smooth bevel ramp, sharp pass = flat raised top
        bg2.filter = 'blur(3px)';
        bg2.strokeStyle = '#fff'; bg2.lineWidth = 13;
        bg2.beginPath(); bg2.arc(256, 256, 225, 0, Math.PI * 2); bg2.stroke();
        drawText(bg2, '#fff');
        bg2.filter = 'none';
        bg2.strokeStyle = '#fff'; bg2.lineWidth = 10;
        bg2.beginPath(); bg2.arc(256, 256, 225, 0, Math.PI * 2); bg2.stroke();
        drawText(bg2, '#fff');
      };
      drawBump();
      const btex = new THREE.CanvasTexture(b);
      return { tex, btex, redraw: () => { draw(); drawBump(); tex.needsUpdate = true; btex.needsUpdate = true; } };
    };
    const faceGlyph = mkFace('glyph');
    const faceWord = mkFace('word');
    try { document.fonts.load('900 96px Larken').then(() => { faceGlyph.redraw(); faceWord.redraw(); }); } catch (e) {}
    try { document.fonts.load('italic 900 96px Larken'); } catch (e) {}

    const matGlyph = new THREE.MeshStandardMaterial({ map: faceGlyph.tex, bumpMap: faceGlyph.btex, bumpScale: 0.065, metalness: 0.15, roughness: 0.8 });
    const matWord = new THREE.MeshStandardMaterial({ map: faceWord.tex, bumpMap: faceWord.btex, bumpScale: 0.065, metalness: 0.15, roughness: 0.8 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1b34a0, metalness: 0.2, roughness: 0.82 });
    const geo = new THREE.CylinderGeometry(1, 1, 0.14, 72);

    const group = new THREE.Group();
    scene.add(group);
    let coins = [];
    const buildCoins = (dens) => {
      coins.forEach((c) => group.remove(c.mesh));
      coins = [];
      const N = Math.round((isMobile ? 7 : 13) * dens);
      for (let i = 0; i < N; i++) {
        const fm = (i % 2 === 0) ? matWord : matGlyph;
        const mesh = new THREE.Mesh(geo, [sideMat, fm, fm]);
        const s = 0.7 + Math.random() * 1.05;
        mesh.scale.setScalar(s);
        // spawn without overlapping an existing coin
        let sx = 0, sy = 0, sz = 0, tries = 0;
        do {
          sx = (Math.random() * 2 - 1) * 15; sy = (Math.random() * 2 - 1) * 11; sz = -6 + Math.random() * 10;
          tries++;
        } while (tries < 14 && coins.some((o) => {
          const ddx = o.mesh.position.x - sx, ddy = o.mesh.position.y - sy, ddz = o.mesh.position.z - sz;
          const md = o.r + s; return ddx * ddx + ddy * ddy + ddz * ddz < md * md;
        }));
        mesh.position.set(sx, sy, sz);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(mesh);
        const rx0 = (Math.random() - 0.5) * 0.012;
        const ry0 = (Math.random() - 0.5) * 0.012;
        const rz0 = (Math.random() - 0.5) * 0.008;
        coins.push({
          mesh, r: s,
          vy: 0.008 + Math.random() * 0.014,
          rx: rx0, ry: ry0, rz: rz0,
          rx0, ry0, rz0,
          ivx: 0, ivy: 0, ivz: 0,
          px: Math.random() * Math.PI * 2,
          sway: 0.3 + Math.random() * 0.7
        });
      }
    };
    buildCoins(density);
    this._rebuildCoins = buildCoins;

    const resize = () => {
      const r = hero.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    const sm = { x: 0, y: 0 };
    if (this._prSetters) this._prSetters.push(() => { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._dprCap)); resize(); });
    let t0 = performance.now();
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - t0) / 16.6, 3); t0 = now;
      if (document.hidden || this._coinsOpacity <= 0.001) return;
      const t = now / 1000;
      sm.x += (this._mx - sm.x) * 0.05;
      sm.y += (this._my - sm.y) * 0.05;
      camera.position.x = sm.x * 1.6;
      camera.position.y = -sm.y * 1.2;
      camera.lookAt(0, 0, 0);
      const sv = Math.max(-30, Math.min(30, this._scrollVel || 0));
      coins.forEach((c) => {
        if (!reduced) {
          const p = c.mesh.position;
          p.y -= (c.vy + sv * 0.0009) * dt * 1.9;
          p.x += Math.sin(t * c.sway + c.px) * 0.004 * dt;
          // bounce impulses from collisions, decaying back to a calm drift
          p.x += c.ivx * dt; p.y += c.ivy * dt; p.z += c.ivz * dt;
          const dk = Math.pow(0.972, dt);
          c.ivx *= dk; c.ivy *= dk; c.ivz *= dk;
          // spin relaxes back to its base tumble after a knock
          c.rx += (c.rx0 - c.rx) * 0.012 * dt;
          c.ry += (c.ry0 - c.ry) * 0.012 * dt;
          c.rz += (c.rz0 - c.rz) * 0.012 * dt;
          c.mesh.rotation.x += c.rx * dt;
          c.mesh.rotation.y += c.ry * dt;
          c.mesh.rotation.z += c.rz * dt;
          if (p.x > 16) p.x = 16; else if (p.x < -16) p.x = -16;
          if (p.z > 4.5) p.z = 4.5; else if (p.z < -6.5) p.z = -6.5;
          if (p.y < -13) { p.y = 13; p.x = (Math.random() * 2 - 1) * 15; c.ivx = 0; c.ivy = 0; c.ivz = 0; }
          if (p.y > 13.6) { p.y = -13; }
        }
      });
      // solid-body pass: coins shove each other apart and trade a bounce + spin
      if (!reduced) {
        for (let i = 0; i < coins.length; i++) {
          for (let j = i + 1; j < coins.length; j++) {
            const a = coins[i], b = coins[j];
            const pa = a.mesh.position, pb = b.mesh.position;
            const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
            const minD = (a.r + b.r) * 0.85;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 === 0 || d2 >= minD * minD) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d, nz = dz / d;
            const ma = a.r * a.r, mb = b.r * b.r, mt = ma + mb;
            // push out of overlap (heavier coin budges less)
            const ov = (minD - d);
            pa.x -= nx * ov * (mb / mt); pa.y -= ny * ov * (mb / mt); pa.z -= nz * ov * (mb / mt);
            pb.x += nx * ov * (ma / mt); pb.y += ny * ov * (ma / mt); pb.z += nz * ov * (ma / mt);
            // impulse only if still approaching
            const rvx = b.ivx - a.ivx;
            const rvy = (b.ivy - b.vy * 1.9) - (a.ivy - a.vy * 1.9);
            const rvz = b.ivz - a.ivz;
            const rel = rvx * nx + rvy * ny + rvz * nz;
            if (rel < 0) {
              const imp = Math.min(-rel * 1.5, 0.12);
              const ja = imp * (mb / mt), jb = imp * (ma / mt);
              a.ivx -= nx * ja; a.ivy -= ny * ja; a.ivz -= nz * ja;
              b.ivx += nx * jb; b.ivy += ny * jb; b.ivz += nz * jb;
              const kick = Math.min(imp * 0.5, 0.03);
              a.rx += (Math.random() - 0.5) * kick; a.ry += (Math.random() - 0.5) * kick; a.rz += (Math.random() - 0.5) * kick * 0.6;
              b.rx += (Math.random() - 0.5) * kick; b.ry += (Math.random() - 0.5) * kick; b.rz += (Math.random() - 0.5) * kick * 0.6;
            }
          }
        }
      }
      renderer.render(scene, camera);
    };
    loop();
  }
}
