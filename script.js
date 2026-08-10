/* The Machinery of Compliance — contents index + client-side search.
   No dependencies. Renders on load so the markup is in the DOM for crawlers
   that execute JS, while the section headings and copy remain in the static
   HTML for those that don't. */

const PARTS = [
  { name: "Front matter", title: "Before the argument begins", items: [
    "If You Are in Danger",
    "A Note on Content",
    "The Short Version",
    "How to Read This Book",
    "A Note on Method",
    "Introduction: Grammar, Not Vocabulary",
    "Map of the Layers",
  ]},
  { name: "Part I", title: "The Psychology of the Mechanism", start: 1, items: [
    "The Machinery of Compliance",
    "The Engine",
    "The Reversal",
    "The Curated Mind",
    "The Trained Nervous System",
    "The Omniscient Pocket",
    "The Weather of the Self",
    "The Ledger as Cage",
    "How Ordinary People Live With It",
    "The Perfect Alibi",
    "The Pattern That Isn't There",
    "The Way In",
    "The Hand That Feeds",
    "The Borrowed Threat",
    "The Held Secret",
  ]},
  { name: "Part II", title: "The Digital & Physical Infrastructure of Control", start: 16, items: [
    "The Mercenary Market and the Forensic Answer",
    "Every Room, Miked and Watched",
    "The Profiling Engine",
    "The Smart Home as Informant",
    "The Keys to Everything",
    "The Body, the Car, and the Door",
    "The Platform and the Tunnel",
  ]},
  { name: "Part III", title: "When Harm Becomes Physical, Across All Four Scales", start: 23, items: [
    "What Looks Like Ordinary Decline",
    "The Subtraction",
    "Four Scales, One Pathogen Logic",
    "The Body and the Bloodline",
    "The Cyanide Convergence",
  ]},
  { name: "Part IV", title: "Silencing the Evidence, Across All Four Scales", start: 28, items: [
    "The Arithmetic of Concealment",
    "Silence Enforced by Law and Leverage",
    "The Bullet and the Frozen Account",
  ]},
  { name: "Part V", title: "Manufacturing the Narrative, Entrapment & Deception", start: 31, items: [
    "The Real Thing, Engineered",
    "Recruiting the Bystander's Own Eyes",
    "Six Percent of the Truth",
    "A Disclosure That Never Happened",
    "Two Lies, Braced Against Each Other",
    "The Case Made to Fit",
    "The Court as the Instrument",
  ]},
  { name: "Part VI", title: "Community & Institutional Capture", start: 38, items: [
    "The World Without Exits",
    "The Community as Informant",
    "The Church as Cover",
    "The Parallel Life",
  ]},
  { name: "Part VII", title: "From the Syndicate to the State", start: 42, items: [
    "The Escalator With No Clean Line",
    "The State Confesses",
  ]},
  { name: "Part VIII", title: "Intelligence-Grade Operations & the State", start: 44, items: [
    "The Same Form, Every Time",
    "The Firehose",
    "The Crowd as the Weapon",
  ]},
  { name: "Part IX", title: "Money, Total Access, and the Convergence", start: 47, items: [
    "Money as the Elevator",
    "What Total Access Actually Buys",
  ]},
  { name: "Part X", title: "Exit, Documentation & the Evidentiary Record", start: 49, items: [
    "Becoming the Author, Not the Subject",
  ]},
  { name: "Back matter", title: "The practical apparatus", items: [
    "Afterword: What the Evidence Actually Bought",
    "Appendix: Recognizing It From the Inside",
    "Appendix: Grounding Your Own Mind",
    "Appendix: Building a Record",
    "Appendix: Helping Someone You're Worried About",
    "Appendix: Coming Back to Yourself",
    "Appendix: Resources and Help",
    "Glossary",
    "Selected Bibliography",
    "Index: Cases, People, and Concepts",
  ]},
];

const toc = document.getElementById("toc");
const input = document.getElementById("chapter-search");
const status = document.getElementById("search-status");

if (toc) {
  const frag = document.createDocumentFragment();

  PARTS.forEach((part) => {
    const box = document.createElement("section");
    box.className = "part";

    const name = document.createElement("p");
    name.className = "part-name";
    name.textContent = part.name;

    const title = document.createElement("h3");
    title.className = "part-title";
    title.textContent = part.title;

    const ol = document.createElement("ol");
    part.items.forEach((label, i) => {
      const li = document.createElement("li");
      if (part.start != null) {
        const n = document.createElement("span");
        n.className = "n";
        n.textContent = String(part.start + i).padStart(2, "0");
        li.appendChild(n);
      } else {
        li.style.paddingLeft = "0";
      }
      const text = document.createElement("span");
      text.className = "t";
      text.textContent = label;
      li.appendChild(text);
      li.dataset.search = label.toLowerCase();
      ol.appendChild(li);
    });

    box.append(name, title, ol);
    box.dataset.search = (part.name + " " + part.title).toLowerCase();
    frag.appendChild(box);
  });

  toc.appendChild(frag);
}

/* ── search ────────────────────────────────────────────────── */
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function runSearch(raw) {
  const q = raw.trim().toLowerCase();
  const parts = toc.querySelectorAll(".part");
  let hits = 0;

  parts.forEach((part) => {
    const lis = part.querySelectorAll("li");
    let visibleInPart = 0;

    lis.forEach((li) => {
      const label = li.querySelector(".t");
      const hay = li.dataset.search;
      const match = !q || hay.includes(q) || part.dataset.search.includes(q);

      li.hidden = !match;
      if (match) { visibleInPart++; if (q) hits++; }

      // re-render the label, highlighting the matched run
      const original = label.dataset.raw || label.textContent;
      label.dataset.raw = original;
      if (q && hay.includes(q)) {
        label.innerHTML = original.replace(
          new RegExp(escapeRe(raw.trim()), "ig"),
          (m) => `<mark>${m}</mark>`
        );
      } else {
        label.textContent = original;
      }
    });

    part.hidden = visibleInPart === 0;
  });

  if (!q) {
    status.textContent = "";
  } else {
    status.textContent = hits === 0
      ? `No chapter titles match “${raw.trim()}”. The full text is searchable in the PDF and EPUB.`
      : `${hits} ${hits === 1 ? "entry" : "entries"} matching “${raw.trim()}”.`;
  }
}

if (input && toc) {
  let t;
  input.addEventListener("input", (e) => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => runSearch(v), 110);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.value = ""; runSearch(""); }
  });
}

/* ── copy citation ─────────────────────────────────────────── */
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const original = btn.textContent;
      btn.textContent = "Copied";
      btn.dataset.done = "1";
      setTimeout(() => { btn.textContent = original; delete btn.dataset.done; }, 2000);
    } catch {
      btn.textContent = "Press ⌘C to copy";
    }
  });
});

/* ── quick exit ────────────────────────────────────────────────
   Genre standard on domestic-abuse resources. Replaces this page in
   the session history so Back does not return to it, then navigates
   somewhere unremarkable. It cannot clear browsing history — the page
   says so plainly rather than implying safety it can't deliver.       */
(function () {
  const SAFE = "https://www.google.com/search?q=weather+forecast";
  function bail() {
    try { window.open(SAFE, "_blank"); } catch (_) {}
    try { location.replace(SAFE); } catch (_) { location.href = SAFE; }
  }
  const btn = document.getElementById("exit-btn");
  if (btn) btn.addEventListener("click", bail);

  // Triple-Escape also exits, for readers who can't reach the button.
  let taps = 0, timer;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.activeElement === document.getElementById("chapter-search")) return;
    taps++;
    clearTimeout(timer);
    timer = setTimeout(() => { taps = 0; }, 700);
    if (taps >= 3) bail();
  });
})();

/* ── mobile navigation ─────────────────────────────────────── */
(function () {
  const btn = document.getElementById("nav-toggle");
  const list = document.getElementById("nav-links");
  if (!btn || !list) return;
  const setOpen = (open) => {
    list.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => setOpen(!list.classList.contains("open")));
  // close after choosing a destination, and on Escape
  list.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && list.classList.contains("open")) { setOpen(false); btn.focus(); }
  });
})();

/* ── back to top ───────────────────────────────────────────── */
(function () {
  const btn = document.getElementById("to-top");
  if (!btn) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ticking = false;
  const update = () => {
    btn.classList.toggle("show", window.scrollY > 900);
    ticking = false;
  };
  addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus?.();
  });
  update();
})();
