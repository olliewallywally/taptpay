// @ts-nocheck
/*
 * LandingRuntime — adapted from the design prototype.
 * Scroll-linking and camera animation live here as readable source. Kept
 * imperative by design:
 * it queries the DOM rendered by LandingPage.tsx via stable element ids.
 * ts-nocheck: this is prototype-fidelity code; typing it would mean rewriting it.
 */

export class LandingRuntime {
  props;
  constructor(props = {}) {
    this.props = props;
    this._cleanups = [];
    this._timeouts = new Set();
    this._frames = new Set();
    this._observers = new Set();
    this._animations = new Set();
    this._destroyed = false;
  }

  listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    const cleanup = () => target.removeEventListener(type, handler, options);
    this._cleanups.push(cleanup);
    return cleanup;
  }

  later(callback, delay) {
    const id = window.setTimeout(() => {
      this._timeouts.delete(id);
      if (!this._destroyed) callback();
    }, delay);
    this._timeouts.add(id);
    return id;
  }

  frame(callback) {
    const id = requestAnimationFrame((time) => {
      this._frames.delete(id);
      if (!this._destroyed) callback(time);
    });
    this._frames.add(id);
    return id;
  }

  cancelFrame(id) {
    if (!id) return;
    cancelAnimationFrame(id);
    this._frames.delete(id);
  }

  trackObserver(observer) {
    this._observers.add(observer);
    return observer;
  }

  trackAnimation(animation) {
    this._animations.add(animation);
    animation.finished.catch(() => {}).finally(() => this._animations.delete(animation));
    return animation;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.cancelFrame(this._raf);
    this._raf = null;
    for (const id of this._frames) cancelAnimationFrame(id);
    this._frames.clear();
    for (const id of this._timeouts) clearTimeout(id);
    this._timeouts.clear();
    for (const observer of this._observers) observer.disconnect();
    this._observers.clear();
    for (const animation of this._animations) animation.cancel();
    this._animations.clear();
    for (const cleanup of this._cleanups.splice(0).reverse()) {
      try { cleanup(); } catch (error) {}
    }
    this.closeMenu?.();
    if (this._countedActive) {
      const active = Number(document.documentElement.dataset.landingRuntimeActive || 1);
      document.documentElement.dataset.landingRuntimeActive = String(Math.max(0, active - 1));
      this._countedActive = false;
    }
    document.body.style.overflow = '';
    this._cine = null;
    this._p3 = null;
  }

  init() {
    this._destroyed = false;
    this._raf = null;
    this.reducedMotion = Boolean(this.props.reducedMotion) || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const active = Number(document.documentElement.dataset.landingRuntimeActive || 0);
    document.documentElement.dataset.landingRuntimeActive = String(active + 1);
    this._countedActive = true;
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const map = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
    this.$ = $; this.$$ = $$;
    this._mx = 0; this._my = 0;
    this.listen(window, 'pointermove', (e) => {
      this._mx = (e.clientX / window.innerWidth) * 2 - 1;
      this._my = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // wireframe buttons: solid on click
    $$('.tp-wire').forEach((btn) => {
      this.listen(btn, 'click', () => {
        const on = btn.getAttribute('data-solid') === '1';
        btn.setAttribute('data-solid', on ? '0' : '1');
        btn.style.background = on ? 'transparent' : '#5E9DFF';
        btn.style.color = on ? '#5E9DFF' : '#040D6D';
      });
    });

    // smooth anchors
    $$('.tp-anchor').forEach((a) => {
      this.listen(a, 'click', (e) => {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('#')) return;
        const t = document.getElementById(href.slice(1));
        if (!t) return;
        e.preventDefault();
        window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY, behavior: this.reducedMotion ? 'auto' : 'smooth' });
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
      this.listen(burger, 'click', () => {
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'auto';
        document.body.style.overflow = 'hidden';
      });
      const mc = $('#tp-menu-close');
      if (mc) this.listen(mc, 'click', this.closeMenu);
    }
    const syncNavMode = () => {
      const mobile = window.innerWidth < 900;
      const links = $('#tp-nav-links');
      if (links) links.style.display = mobile ? 'none' : 'flex';
      if (burger) burger.style.display = mobile ? 'block' : 'none';
    };
    syncNavMode();
    this.listen(window, 'resize', syncNavMode);

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
    const io = this.trackObserver(new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (en.isIntersecting) {
          const el = en.target;
          this.later(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 60);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.18 }));
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
    this.listen(window, 'resize', measure);
    this.listen(window, 'load', measure);

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

      this._raf = this.frame(tick);
    };
    this._raf = this.frame(tick);

    // industries
    this.industryData = {
      property: {
        tag: 'property management', h: 'rent that collects itself.',
        sub: 'set the schedule once. taptpay invoices every cycle, chases every late payment, and marks every dollar the moment it lands.',
        stats: [['$0', 'TaptPay platform fee'], ['2–10', 'way rent splits'], ['auto', 'reminders, never duplicated']],
        feats: ['recurring rent schedules on autopilot', 'overdue reminders that never double-send', 'utility bills & expenses, sent as payment links', 'gst receipts emailed automatically']
      },
      trades: {
        tag: 'trades & services', h: 'quote → deposit → balance → done.',
        sub: 'the quote and the money are one object. the customer accepting the job is the deposit hitting your account.',
        stats: [['$0', 'TaptPay platform fee'], ['on accept', 'deposit link presented'], ['auto', 'gst receipts emailed']],
        feats: ['line-item quote builder with deposit toggles', 'quick invoice for callouts — keypad, client, send', 'incl gst / + gst, snapshotted per quote', 'client profiles with full event timelines']
      },
      retail: {
        tag: 'retail & hospitality', h: 'a terminal in every pocket.',
        sub: 'cafés, markets, food trucks — keypad to charge, tap or scan to pay, split the table without maths at the counter.',
        stats: [['$0', 'TaptPay platform fee'], ['multi', 'stack — unlimited payments at once'], ['2–10', 'way bill splits']],
        feats: ['charge in seconds from the keypad', 'payment boards — customers scan or tap the counter', 'per-person receipts on splits', 'live transaction history & analytics']
      }
    };
    this.renderIndustry(this.props.defaultIndustry ?? 'property', true);
    $$('.tp-tab').forEach((tab) => {
      this.listen(tab, 'click', () => this.renderIndustry(tab.getAttribute('data-ind'), false));
    });

    this.initContact();
    this.initMobileLayout();
    // ---- adaptive motion quality ----
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


    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) { this.cancelFrame(this._raf); this._raf = null; }
      else if (!this._raf) { lastY = window.scrollY; this._raf = this.frame(tick); }
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
      if (this.reducedMotion) ms = 0;
      const to = 'translate3d(' + (-tx) + 'px,' + (-ty) + 'px,' + tz + 'px)';
      if (!ms) { world.style.transform = to; camX = tx; camY = ty; camZ = tz; return; }
      const from = 'translate3d(' + (-camX) + 'px,' + (-camY) + 'px,' + camZ + 'px)';
      const mid = 'translate3d(' + (-(camX + tx) / 2) + 'px,' + (-(camY + ty) / 2) + 'px,' + (tz - 170) + 'px) rotateZ(' + (rollDir * 1.5) + 'deg) rotateX(' + (ty > camY ? 2.4 : -2.4) + 'deg)';
      world.style.transform = to;
      worldAnim = this.trackAnimation(world.animate(
        [{ transform: from }, { transform: mid, offset: 0.5 }, { transform: to }],
        { duration: ms, easing: EASE }
      ));
      // motion blur during the flight — peaks mid-transit, sharp at rest
      if (vpEl) {
        if (blurAnim) { try { blurAnim.cancel(); } catch (e) {} }
        const bm = this._blurMax ?? 3.5;
        blurAnim = this.trackAnimation(vpEl.animate(
          [
            { filter: 'blur(0px)' },
            { filter: 'blur(' + (bm * 0.57).toFixed(2) + 'px)', offset: 0.3 },
            { filter: 'blur(' + bm.toFixed(2) + 'px)', offset: 0.5 },
            { filter: 'blur(' + (bm * 0.43).toFixed(2) + 'px)', offset: 0.75 },
            { filter: 'blur(0px)' }
          ],
          { duration: ms, easing: 'linear' }
        ));
      }
      camX = tx; camY = ty; camZ = tz;
    };

    // ---- phone rig ----
    const rigTo = (x, y, ms) => {
      rig.style.transition = ms ? 'transform ' + ms + 'ms ' + EASE : 'none';
      if (this.reducedMotion) ms = 0;
      rig.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%)';
    };
    const turnTo = (deg, ms) => {
      if (this._p3) this._p3.setRot(deg, this.reducedMotion ? 0 : ms);
    };
    const sweep = () => {
      if (this.reducedMotion || !glare) return;
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

    const popIn = (el) => {
      el.style.animation = this.reducedMotion ? 'none' : 'tpPopIn .75s cubic-bezier(.34,1.45,.5,1) forwards';
      if (this.reducedMotion) { el.style.opacity = '1'; el.style.transform = 'none'; }
    };
    const popOut = (el) => {
      el.style.animation = this.reducedMotion ? 'none' : 'tpPopOut .45s cubic-bezier(.5,.06,.4,1) forwards';
      if (this.reducedMotion) { el.style.opacity = '0'; el.style.transform = 'none'; }
    };

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

      glareT = this.later(sweep, 1080);

      if (headB) headB.style.opacity = i === 0 ? headB.style.opacity : '0';
      if (headA) headA.style.opacity = i === 0 ? headA.style.opacity : '0';
      if (i !== 0) ghost.forEach((gw) => { gw.style.opacity = '0'; });
      if (cap) cap.style.opacity = i === 0 ? '0' : '1';

      // text: world billboards on desktop, HUD on mobile
      if (mob) {
        if (visCard) { popOut(visCard); visCard = null; }
        if (i === 0) {
          popOut(hud); hud.style.pointerEvents = 'none';
          hideT = this.later(() => { hud.style.display = 'none'; }, 460);
        } else {
          hud.style.display = 'block';
          if (bt.wallets) { hud.style.bottom = 'auto'; hud.style.top = '8vh'; hud.style.width = 'calc(100vw - 28px)'; hud.style.textAlign = 'center'; }
          else { hud.style.bottom = 'auto'; hud.style.top = '11vh'; hud.style.width = 'min(68vw,300px)'; hud.style.textAlign = ''; }
          hud.style.maxHeight = '44vh';
          hud.style.padding = '0';
          if (bt.side === 'R') { hud.style.right = '14px'; hud.style.left = 'auto'; }
          else { hud.style.left = '14px'; hud.style.right = 'auto'; }
          popOut(hud);
          showT = this.later(() => {
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
          showT = this.later(() => { popIn(card); }, 560);
          visCard = card;
        } else {
          visCard = null;
        }
      }

      dots.forEach((d, di) => { d.style.background = di === i ? '#5E9DFF' : 'rgba(244,241,232,0.15)'; });
    };
    this._applyCineBeat = applyBeat;

    this.listen(window, 'resize', () => { setPlaces(); placeGhost(); if (cur >= 0) applyBeat(cur, cur); });

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
    this.later(() => {
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
    this.listen(head, 'click', () => {
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
    if (send) this.listen(send, 'click', () => {
      const f = $('#tpc-fields'); const t = $('#tpc-thanks');
      if (f) f.style.display = 'none';
      if (t) t.style.display = 'flex';
    });
  }

  // ---------------- live app phones ----------------
  initPhones() {
    // The React host owns phone-screen scale with ResizeObserver. Runtime must
    // not write transforms or schedule delayed refits: a lazy swap can otherwise
    // replace the scaled node with a full-size 390×844 screen.
    document.querySelectorAll('.tp-phone-live').forEach((btn) => {
      this.listen(btn, 'click', (e) => {
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
      this.listen(t, 'pointermove', (e) => {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        inner.style.transform = 'rotateY(' + (x * 16) + 'deg) rotateX(' + (-y * 12) + 'deg)';
      });
      this.listen(t, 'pointerleave', () => { inner.style.transform = 'rotateY(0deg) rotateX(0deg)'; });
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
      animT = this.later(() => {
        copy.style.display = 'none';
        phoneCol.style.display = 'flex';
        window.dispatchEvent(new Event('resize'));
        this.frame(() => this.frame(() => {
          phoneCol.style.opacity = '1'; phoneCol.style.transform = 'translateX(0)';
        }));
      }, 340);
    };
    const hide = () => {
      if (!open) return; open = false;
      clearTimeout(animT);
      phoneCol.style.opacity = '0'; phoneCol.style.transform = 'translateX(80px)';
      animT = this.later(() => {
        phoneCol.style.display = 'none';
        copy.style.display = 'block';
        this.frame(() => this.frame(() => {
          copy.style.opacity = '1'; copy.style.transform = 'translateX(0)';
        }));
        tab.style.transform = 'translateX(0)'; tab.style.opacity = '1'; tab.style.pointerEvents = 'auto';
      }, 400);
    };
    this.listen(tab, 'click', reveal);
    this.listen(hideBtn, 'click', hide);
  }

  // ---------------- CSS-3D phone body ----------------
  initPhone3D() {
    const box = document.getElementById('tp3');
    const spin = document.getElementById('tp3-spin');
    const face = document.getElementById('tp3-face');
    const back = document.getElementById('tp3-back');
    if (!box || !spin || !face) return;
    if (window.innerWidth < 880) box.style.width = 'clamp(150px,22.5vh,240px)';
    box.style.transformStyle = 'preserve-3d';
    spin.style.transformStyle = 'preserve-3d';
    const fitDepth = () => {
      const depth = Math.max(12, box.getBoundingClientRect().width * 0.11);
      const half = depth / 2;
      face.style.transform = 'translateZ(' + half + 'px)';
      if (back) back.style.transform = 'rotateY(180deg) translateZ(' + half + 'px)';
    };
    fitDepth();
    if (typeof ResizeObserver !== 'undefined') {
      this.trackObserver(new ResizeObserver(fitDepth)).observe(box);
    }

    let rot = -540;
    const setRot = (deg, ms) => {
      spin.style.transition = ms ? 'transform ' + ms + 'ms cubic-bezier(.6,.04,.16,1)' : 'none';
      spin.style.transform = 'rotateY(' + deg + 'deg)';
      rot = deg;
    };

    setRot(rot, 0);
    this._p3 = { setRot };
  }

  // Decorative hero field is CSS-only; reduced-motion viewers get a still wash.
  initCoins() {
    const coins = document.querySelector('#tp-coins');
    if (!coins) return;
    coins.style.transition = 'opacity .2s linear';
    if (this.props.reducedMotion) coins.style.opacity = '0.45';
  }
}
