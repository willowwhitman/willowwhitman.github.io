/* ─────────────────────────────────────────────────────────────
   willowwhitman.com/read — in-browser reader.
   Two modes over the same book: "Typeset" renders the PDF page for
   page (PDF.js), "Reflow" renders the EPUB as adaptable text
   (epub.js). All libraries are self-hosted in /vendor — this page
   makes no third-party requests.

   Privacy stance, same as the rest of the site: nothing is written
   to the device unless the reader opts in. The "remember my place"
   toggle is off by default; turning it off again clears every key.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const PDF_URL = "/downloads/the-machinery-of-compliance.pdf";
  const EPUB_URL = "/downloads/the-machinery-of-compliance.epub";
  const NS = "wwmc-reader:";

  const $ = (id) => document.getElementById(id);
  const viewer = $("viewer");
  const stage = viewer.parentElement;
  const statusBox = $("rd-status");
  const statusMsg = $("rd-status-msg");
  const tocPane = $("rd-toc");
  const tocList = $("toc-list");
  const tocBtn = $("toc-btn");
  const chapterEl = $("rd-chapter");
  const barFill = $("rd-bar-fill");
  const pctEl = $("rd-pct");
  const sizeDn = $("size-dn");
  const sizeUp = $("size-up");
  const themeBtn = $("theme-btn");
  const modePdfBtn = $("mode-pdf");
  const modeEpubBtn = $("mode-epub");
  const prevBtn = $("prev-btn");
  const nextBtn = $("next-btn");
  const rememberToggle = $("remember-toggle");

  /* ── quick exit (same behaviour as the rest of the site) ── */
  const SAFE = "https://www.google.com/search?q=weather+forecast";
  function bail() {
    try { window.open(SAFE, "_blank"); } catch (_) {}
    try { location.replace(SAFE); } catch (_) { location.href = SAFE; }
  }
  $("exit-btn").addEventListener("click", bail);
  let escTaps = 0, escTimer;
  function countEscape() {
    escTaps++;
    clearTimeout(escTimer);
    escTimer = setTimeout(() => { escTaps = 0; }, 700);
    if (escTaps >= 3) bail();
  }

  /* ── storage, gated behind the opt-in ─────────────────────── */
  let optIn = false;
  try { optIn = localStorage.getItem(NS + "on") === "1"; } catch (_) {}
  function save(key, val) {
    if (!optIn) return;
    try { localStorage.setItem(NS + key, String(val)); } catch (_) {}
  }
  function load(key) {
    if (!optIn) return null;
    try { return localStorage.getItem(NS + key); } catch (_) { return null; }
  }
  function clearAll() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.indexOf(NS) === 0)
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
  }

  /* ── state ────────────────────────────────────────────────── */
  let mode = null;                       // "pdf" | "epub"
  let theme = load("theme") === "light" ? "light" : "dark";
  let fontPct = parseInt(load("font"), 10) || 105;
  let pdfZoom = parseFloat(load("zoom")) || 1;
  let tocEntries = [];                   // [{el, page?|href?}]
  const isPhone = () => window.innerWidth < 760;

  function setStatus(msg) {
    statusBox.hidden = false;
    statusMsg.textContent = msg;
  }
  function setStatusError() {
    statusBox.hidden = false;
    statusBox.innerHTML =
      '<p class="small">The reader could not open the book in this browser. The book itself is unaffected — download it directly:</p>' +
      '<p><a href="' + PDF_URL + '" download>PDF (4.6 MB)</a> &nbsp;·&nbsp; <a href="' + EPUB_URL + '" download>EPUB (3.2 MB)</a></p>';
  }
  function hideStatus() { statusBox.hidden = true; }

  function setProgress(frac) {
    if (!(frac >= 0)) { pctEl.textContent = ""; barFill.style.width = "0"; return; }
    const p = Math.max(0, Math.min(1, frac));
    barFill.style.width = (p * 100).toFixed(1) + "%";
    pctEl.textContent = Math.round(p * 100) + "%";
  }

  /* ── TOC ──────────────────────────────────────────────────── */
  function buildToc(items) {
    tocList.innerHTML = "";
    tocEntries = [];
    const addLevel = (list, parentOl) => {
      list.forEach((item) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.textContent = item.label;
        a.href = "#";
        a.addEventListener("click", (e) => {
          e.preventDefault();
          item.go();
          if (isPhone()) setTocOpen(false);
        });
        li.appendChild(a);
        parentOl.appendChild(li);
        tocEntries.push({ el: a, page: item.page, href: item.href });
        if (item.children && item.children.length) {
          const ol = document.createElement("ol");
          li.appendChild(ol);
          addLevel(item.children, ol);
        }
      });
    };
    addLevel(items, tocList);
  }
  function highlightToc(matchFn) {
    let current = null;
    tocEntries.forEach((t) => { if (matchFn(t)) current = t; });
    tocEntries.forEach((t) => t.el.classList.toggle("current", t === current));
    if (current) chapterEl.textContent = current.el.textContent;
    return current;
  }
  function setTocOpen(open) {
    tocPane.classList.toggle("closed", !open);
    tocBtn.setAttribute("aria-expanded", String(open));
    tocBtn.setAttribute("aria-pressed", String(open));
  }
  tocBtn.addEventListener("click", () =>
    setTocOpen(tocPane.classList.contains("closed")));

  /* ── script loader (vendored libs, loaded on demand) ──────── */
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("failed " + src));
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  /* ══════════════════════ PDF (Typeset) ═════════════════════ */
  const pdf = {
    doc: null, pageEls: [], offsets: [], ratio: 1.545,
    io: null, tasks: {}, current: 1, outlinePages: [],
    onScroll: null,
  };

  function pageCssWidth() {
    const base = Math.min(viewer.clientWidth - 36, 800);
    return Math.max(260, Math.round(base * pdfZoom));
  }

  async function initPdf() {
    setStatus("Opening the typeset edition…");
    await loadScript("/vendor/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
    pdf.doc = await window.pdfjsLib.getDocument(PDF_URL).promise;

    const p1 = await pdf.doc.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    pdf.ratio = vp1.height / vp1.width;

    viewer.classList.add("pdf-scroll");
    const frag = document.createDocumentFragment();
    pdf.pageEls = [];
    for (let i = 1; i <= pdf.doc.numPages; i++) {
      const d = document.createElement("div");
      d.className = "pdf-page";
      d.dataset.page = i;
      d.innerHTML = '<span class="pnum">' + i + "</span>";
      frag.appendChild(d);
      pdf.pageEls.push(d);
    }
    viewer.appendChild(frag);
    layoutPdf();

    pdf.io = new IntersectionObserver(onPdfIntersect, {
      root: viewer, rootMargin: "1400px 0px",
    });
    pdf.pageEls.forEach((el) => pdf.io.observe(el));

    let ticking = false;
    pdf.onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; trackPdfPosition(); });
    };
    viewer.addEventListener("scroll", pdf.onScroll, { passive: true });

    buildPdfOutline();  // async, fills TOC when ready

    const startPage = parseInt(load("pdf-page"), 10);
    if (startPage > 1) scrollToPage(startPage);
    trackPdfPosition();
  }

  function layoutPdf() {
    const w = pageCssWidth();
    const h = Math.round(w * pdf.ratio);
    pdf.offsets = [];
    pdf.pageEls.forEach((el, idx) => {
      el.style.width = w + "px";
      el.style.height = h + "px";
      pdf.offsets.push(idx * (h + 18) + 18);
    });
  }

  function onPdfIntersect(entries) {
    entries.forEach((entry) => {
      const n = parseInt(entry.target.dataset.page, 10);
      if (entry.isIntersecting) renderPdfPage(n);
      else unrenderPdfPage(n);
    });
  }

  async function renderPdfPage(n) {
    const el = pdf.pageEls[n - 1];
    if (!el || el.querySelector("canvas") || pdf.tasks[n]) return;
    try {
      const page = await pdf.doc.getPage(n);
      if (!pdf.doc) return;
      const cssW = pageCssWidth();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (cssW / page.getViewport({ scale: 1 }).width) * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
      pdf.tasks[n] = task;
      await task.promise;
      delete pdf.tasks[n];
      if (!el.isConnected) return;
      el.innerHTML = "";
      el.appendChild(canvas);
      hideStatus();
    } catch (e) {
      delete pdf.tasks[n];
      /* cancelled renders are routine when scrolling fast */
    }
  }

  function unrenderPdfPage(n) {
    const el = pdf.pageEls[n - 1];
    if (pdf.tasks[n]) { try { pdf.tasks[n].cancel(); } catch (_) {} delete pdf.tasks[n]; }
    if (el && el.querySelector("canvas")) {
      el.innerHTML = '<span class="pnum">' + n + "</span>";
    }
  }

  function trackPdfPosition() {
    const mid = viewer.scrollTop + viewer.clientHeight / 2;
    let n = 1;
    for (let i = 0; i < pdf.offsets.length; i++) {
      if (pdf.offsets[i] <= mid) n = i + 1; else break;
    }
    pdf.current = n;
    setProgress(n / pdf.doc.numPages);
    save("pdf-page", n);
    highlightToc((t) => typeof t.page === "number" && t.page <= n);
  }

  function scrollToPage(n) {
    const idx = Math.max(1, Math.min(pdf.doc.numPages, n)) - 1;
    viewer.scrollTop = pdf.offsets[idx] - 9;
  }

  async function buildPdfOutline() {
    try {
      const outline = await pdf.doc.getOutline();
      if (!outline || !outline.length) return;
      const resolve = async (items) => {
        const out = [];
        for (const it of items) {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.doc.getDestination(dest);
          let pageNum = null;
          if (Array.isArray(dest) && dest[0]) {
            try { pageNum = (await pdf.doc.getPageIndex(dest[0])) + 1; } catch (_) {}
          }
          const entry = {
            label: it.title,
            page: pageNum,
            go: pageNum ? () => scrollToPage(pageNum) : () => {},
            children: it.items && it.items.length ? await resolve(it.items) : [],
          };
          out.push(entry);
        }
        return out;
      };
      const items = await resolve(outline);
      if (mode === "pdf") { buildToc(items); trackPdfPosition(); }
    } catch (_) { /* no outline — TOC stays empty */ }
  }

  function teardownPdf() {
    if (pdf.io) pdf.io.disconnect();
    if (pdf.onScroll) viewer.removeEventListener("scroll", pdf.onScroll);
    Object.keys(pdf.tasks).forEach((n) => { try { pdf.tasks[n].cancel(); } catch (_) {} });
    pdf.tasks = {};
    if (pdf.doc) { try { pdf.doc.destroy(); } catch (_) {} }
    pdf.doc = null; pdf.pageEls = []; pdf.offsets = [];
    viewer.classList.remove("pdf-scroll");
    viewer.innerHTML = "";
  }

  /* ══════════════════════ EPUB (Reflow) ═════════════════════ */
  const ep = { book: null, rendition: null, locationsReady: false };

  async function initEpub() {
    setStatus("Opening the book…");
    await loadScript("/vendor/jszip.min.js");
    await loadScript("/vendor/epub.min.js");
    ep.book = window.ePub(EPUB_URL);
    ep.rendition = ep.book.renderTo(viewer, {
      width: "100%", height: "100%",
      spread: "none", flow: "paginated",
      allowScriptedContent: false,
    });

    ep.rendition.themes.register("dark", {
      "body": { "background": "transparent", "color": "#E9ECF4" },
      "a": { "color": "#E8834A" },
      "a:visited": { "color": "#E8834A" },
    });
    ep.rendition.themes.register("light", {
      "body": { "background": "transparent", "color": "#221C14" },
      "a": { "color": "#A34314" },
      "a:visited": { "color": "#A34314" },
    });
    ep.rendition.themes.select(theme);
    ep.rendition.themes.fontSize(fontPct + "%");

    ep.rendition.on("rendered", hideStatus);
    ep.rendition.on("relocated", (loc) => {
      const href = loc.start.href;
      highlightToc((t) => t.href && href.indexOf(t.href.split("#")[0]) !== -1);
      if (ep.locationsReady) {
        setProgress(ep.book.locations.percentageFromCfi(loc.start.cfi));
      }
      save("epub-cfi", loc.start.cfi);
    });
    /* keys pressed inside the book's iframe */
    ep.rendition.on("keyup", (e) => {
      if (e.key === "ArrowRight") ep.rendition.next();
      if (e.key === "ArrowLeft") ep.rendition.prev();
      if (e.key === "Escape") countEscape();
    });
    /* swipe to turn pages (epub.js relays touch events from the iframe) */
    let swipeX = null, swipeY = null;
    ep.rendition.on("touchstart", (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (t) { swipeX = t.screenX; swipeY = t.screenY; }
    });
    ep.rendition.on("touchend", (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (t && swipeX !== null) {
        const dx = t.screenX - swipeX, dy = t.screenY - swipeY;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 60) {
          if (dx < 0) ep.rendition.next(); else ep.rendition.prev();
        }
      }
      swipeX = swipeY = null;
    });

    const startCfi = load("epub-cfi");
    await ep.rendition.display(startCfi || undefined);

    ep.book.loaded.navigation.then((nav) => {
      const convert = (items) => items.map((it) => ({
        label: (it.label || "").trim(),
        href: it.href,
        go: () => ep.rendition.display(it.href),
        children: it.subitems && it.subitems.length ? convert(it.subitems) : [],
      }));
      if (mode === "epub") buildToc(convert(nav.toc));
    });

    ep.book.ready
      .then(() => ep.book.locations.generate(600))
      .then(() => {
        ep.locationsReady = true;
        const loc = ep.rendition.currentLocation();
        if (loc && loc.start) setProgress(ep.book.locations.percentageFromCfi(loc.start.cfi));
      })
      .catch(() => {});
  }

  function teardownEpub() {
    if (ep.rendition) { try { ep.rendition.destroy(); } catch (_) {} }
    if (ep.book) { try { ep.book.destroy(); } catch (_) {} }
    ep.book = null; ep.rendition = null; ep.locationsReady = false;
    viewer.innerHTML = "";
  }

  /* ── mode switching ───────────────────────────────────────── */
  async function switchMode(next) {
    if (next === mode) return;
    if (mode === "pdf") teardownPdf();
    if (mode === "epub") teardownEpub();
    mode = next;
    document.body.dataset.rmode = mode;
    modePdfBtn.setAttribute("aria-pressed", String(mode === "pdf"));
    modeEpubBtn.setAttribute("aria-pressed", String(mode === "epub"));
    themeBtn.hidden = mode !== "epub";
    sizeDn.setAttribute("aria-label", mode === "pdf" ? "Zoom out" : "Smaller text");
    sizeUp.setAttribute("aria-label", mode === "pdf" ? "Zoom in" : "Larger text");
    sizeDn.textContent = mode === "pdf" ? "−" : "A−";
    sizeUp.textContent = mode === "pdf" ? "+" : "A+";
    tocList.innerHTML = "";
    tocEntries = [];
    chapterEl.textContent = "";
    setProgress(NaN);
    save("mode", mode);
    try {
      if (mode === "pdf") await initPdf();
      else await initEpub();
    } catch (e) {
      setStatusError();
    }
  }
  modePdfBtn.addEventListener("click", () => switchMode("pdf"));
  modeEpubBtn.addEventListener("click", () => switchMode("epub"));

  /* ── controls ─────────────────────────────────────────────── */
  sizeUp.addEventListener("click", () => {
    if (mode === "pdf") {
      pdfZoom = Math.min(2.4, pdfZoom + 0.15); save("zoom", pdfZoom); relayoutPdf();
    } else if (ep.rendition) {
      fontPct = Math.min(170, fontPct + 10); save("font", fontPct);
      ep.rendition.themes.fontSize(fontPct + "%");
    }
  });
  sizeDn.addEventListener("click", () => {
    if (mode === "pdf") {
      pdfZoom = Math.max(0.6, pdfZoom - 0.15); save("zoom", pdfZoom); relayoutPdf();
    } else if (ep.rendition) {
      fontPct = Math.max(80, fontPct - 10); save("font", fontPct);
      ep.rendition.themes.fontSize(fontPct + "%");
    }
  });

  function relayoutPdf() {
    if (!pdf.doc) return;
    const keep = pdf.current;
    pdf.pageEls.forEach((el, i) => unrenderPdfPage(i + 1));
    layoutPdf();
    scrollToPage(keep);
  }

  function applyTheme() {
    document.body.dataset.rtheme = theme;
    themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
    themeBtn.setAttribute("aria-pressed", String(theme === "light"));
    themeBtn.setAttribute("aria-label",
      theme === "dark" ? "Switch to light reading theme" : "Switch to dark reading theme");
    if (ep.rendition) ep.rendition.themes.select(theme);
  }
  themeBtn.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    save("theme", theme);
    applyTheme();
  });

  prevBtn.addEventListener("click", () => {
    if (mode === "epub" && ep.rendition) ep.rendition.prev();
  });
  nextBtn.addEventListener("click", () => {
    if (mode === "epub" && ep.rendition) ep.rendition.next();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { countEscape(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowRight") {
      if (mode === "epub" && ep.rendition) ep.rendition.next();
      else if (mode === "pdf" && pdf.doc) scrollToPage(pdf.current + 1);
    }
    if (e.key === "ArrowLeft") {
      if (mode === "epub" && ep.rendition) ep.rendition.prev();
      else if (mode === "pdf" && pdf.doc) scrollToPage(pdf.current - 1);
    }
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (mode === "pdf") relayoutPdf(); }, 200);
  });

  /* ── remember-my-place opt-in ─────────────────────────────── */
  rememberToggle.checked = optIn;
  rememberToggle.addEventListener("change", () => {
    if (rememberToggle.checked) {
      optIn = true;
      try { localStorage.setItem(NS + "on", "1"); } catch (_) {}
      save("mode", mode);
      save("theme", theme);
      save("font", fontPct);
      save("zoom", pdfZoom);
      if (mode === "pdf" && pdf.doc) save("pdf-page", pdf.current);
      if (mode === "epub" && ep.rendition) {
        const loc = ep.rendition.currentLocation();
        if (loc && loc.start) save("epub-cfi", loc.start.cfi);
      }
    } else {
      optIn = false;
      clearAll();
    }
  });

  /* ── boot ─────────────────────────────────────────────────── */
  setTocOpen(!isPhone());
  applyTheme();
  const savedMode = load("mode");
  switchMode(savedMode === "epub" || savedMode === "pdf"
    ? savedMode
    : (window.innerWidth >= 900 ? "pdf" : "epub"));
})();
