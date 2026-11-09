"use strict";
import * as Core from "./core.js";
import { ICONS } from "./icons.js";
const TZ = "Europe/Amsterdam",
  app = document.getElementById("app");
const D = (s) => new Date(s + "T12:00:00Z"),
  ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d),
  today = () => ymd(new Date());
const add = (s, n) => {
  const d = D(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dow = (s) => (D(s).getUTCDay() + 6) % 7,
  mon = (s) => add(s, -dow(s));
const fmt = (s, o) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: "UTC", ...o }).format(D(s));
const esc = (t) =>
  String(t ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () => crypto.randomUUID(),
  DN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
  ALL = [0, 1, 2, 3, 4, 5, 6];
const PARTS = [
  ["ochtend", "Ochtend"],
  ["middag", "Middag"],
  ["avond", "Avond"],
  ["elk", "Op elk moment"],
];
const COL = ["#8e2440", "#4f8f6c", "#4a78d6", "#8466c8", "#d9803a"];
const IC = {
  boek: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/>',
  halter: '<path d="M3 12h18M6 8v8M18 8v8M9 6v12M15 6v12"/>',
  kalender:
    '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  hart: '<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/>',
  ster: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  huis: '<path d="M4 11l8-7 8 7v9H4z"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  klok: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
Object.assign(
  IC,
  Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, v[2]])),
);
const svg = (n) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${IC[n] || ""}</svg>`;
const gearPoints = Array.from({ length: 32 }, (_, i) => {
  const angle = (i * Math.PI) / 16,
    r = i % 4 < 2 ? 9.5 : 7;
  return `${12 + Math.cos(angle) * r},${12 + Math.sin(angle) * r}`;
}).join(" ");
const GEAR = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><polygon points="${gearPoints}"/><circle cx="12" cy="12" r="3"/></svg>`;
const blank = Core.blank;
let ND = today(),
  NV = "dag",
  TF = { list: "", status: "" },
  legacyBackup = null,
  FILTERS = {},
  AV = "week",
  IR = 30,
  IM = today().slice(0, 7),
  ISD = today(),
  NF = { q: "", kind: "", status: "", link: null },
  S = blank(),
  P = {},
  db,
  T = "routine",
  R = "vandaag",
  vd = today(),
  ad = today(),
  F = { cat: "", col: "" },
  FM = null,
  last = today(),
  OP = {};
/* opslag */
const open = () =>
  new Promise((a, b) => {
    const r = indexedDB.open("dagritme", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => a(r.result);
    r.onerror = () => b(r.error);
  });
const DBPREFIX = "dagapp:";
const kvGet = (k) =>
  new Promise((a, b) => {
    const q = db
      .transaction("kv")
      .objectStore("kv")
      .get(DBPREFIX + k);
    q.onsuccess = () => a(q.result);
    q.onerror = () => b(q.error);
  });
const kvSet = (k, v) =>
  new Promise((a, b) => {
    const t = db.transaction("kv", "readwrite");
    t.objectStore("kv").put(v, DBPREFIX + k);
    t.oncomplete = a;
    t.onerror = () => b(t.error);
  });
function toast(m, e) {
  const t = document.getElementById("ts");
  t.innerHTML = `<div class="${e ? "e" : ""}">${esc(m)}</div>`;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.innerHTML = ""), e ? 6000 : 2200);
}
function refs() {
  const ids = new Set();
  const walk = (x) => {
    if (!x || typeof x !== "object") return;
    if (x.p?.photo) ids.add(x.p.photo);
    for (const v of Object.values(x)) if (v && typeof v === "object") walk(v);
  };
  walk(S);
  if (FM?.v.p?.photo) ids.add(FM.v.p.photo);
  return ids;
}
// Snapshot each write immediately, serialize transactions and write state + photos together.
let writes = Promise.resolve(),
  pendingWrites = 0,
  unsavedChanges = false;
function persist(state, photos, extra = {}) {
  const values = structuredClone({ state, photos, ...extra });
  pendingWrites++;
  app.dataset.saving = "true";
  const run = () =>
    new Promise((resolve, reject) => {
      if (!db) return reject(new Error("Lokale opslag is niet beschikbaar"));
      const tx = db.transaction("kv", "readwrite"),
        store = tx.objectStore("kv");
      tx.oncomplete = () => resolve(true);
      tx.onabort = tx.onerror = () =>
        reject(tx.error || new Error("Opslagtransactie afgebroken"));
      try {
        for (const [k, v] of Object.entries(values)) store.put(v, DBPREFIX + k);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  const task = pendingWrites === 1 ? run() : writes.then(run);
  writes = task.catch(() => {});
  const finished = () => {
    pendingWrites--;
    app.dataset.saving = String(pendingWrites > 0);
  };
  task.then(finished, finished);
  return task;
}
addEventListener("beforeunload", (e) => {
  if (pendingWrites || unsavedChanges || FM?.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function save(photosChanged) {
  try {
    if (photosChanged) {
      const used = refs();
      P = Object.fromEntries(Object.entries(P).filter(([id]) => used.has(id)));
    }
    await persist(S, P);
    unsavedChanges = false;
    schedSync();
    return true;
  } catch (e) {
    unsavedChanges = true;
    toast("Opslaan mislukt. Maak een export: " + e.message, 1);
    return false;
  }
}
let SV = null,
  NS = {},
  SY,
  TH;
const APPV = "4.0.0",
  IOS = /iPhone|iPad|iPod/.test(navigator.userAgent),
  STD =
    !!navigator.standalone || matchMedia("(display-mode: standalone)").matches,
  $o = (id) => document.getElementById(id);
const norm = Core.migrate;
/* regels */
const ver = Core.version,
  sched = Core.schedule;
const pass = (o) =>
  (!F.cat || o.p.cat === F.cat) && (!F.col || o.p.color === F.col);
function moments(d, nf) {
  const o = [];
  for (const h of S.habits) {
    const v = sched(h, d);
    if (!v || (!nf && !pass(h))) continue;
    for (let i = 1; i <= v.count; i++) {
      const lb = (v.labels || h.labels || [])[i - 1] || "",
        pk = PARTS.find((p) => p[0] === lb.toLowerCase());
      o.push({
        h,
        i,
        c: v.count,
        lab: lb,
        part: v.momentParts?.[i] || (pk ? pk[0] : v.part || h.part),
        v,
        k: `${d}|${h.id}|${i}`,
      });
    }
  }
  const key = (m) =>
    S.set.sort === "tijd"
      ? m.h.time || "99:99"
      : String(m.h.ord).padStart(5, "0");
  return o.sort((a, b) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.i - b.i,
  );
}
function occ(d, nf) {
  return Core.occurrences(S, d).filter((o) => nf || pass(o.e));
}
/* weergave */
const hd = (sub, title, x = "") =>
  `<div class="H"><div><div class="m">${esc(sub)}</div><h1>${esc(title)}</h1></div><div class="hb">${x}<button class="gear" data-a="set" aria-label="Instellingen">${GEAR}</button></div></div>`;
const nb = (i, l, t) =>
  `<button class="gear" data-a="${i}" aria-label="${l}">${t}</button>`;
function row(o) {
  const p = o.p || {},
    c = p.color || "",
    img = p.photo && P[p.photo];
  const lead = img
    ? `<img class="th" src="${img}" alt="">`
    : p.icon
      ? `<span class="i" style="background:${c || "#2c2c30"}">${svg(p.icon)}</span>`
      : "";
  const R = p.side === "r";
  return `<div class="r" data-f="${esc(o.id)}|${esc(o.x || "")}">${o.ck !== undefined ? `<button class="k ${o.ck ? "on" : ""}" data-a="${o.a}" data-i="${esc(o.id)}" data-x="${esc(o.x || "")}" aria-pressed="${!!o.ck}" aria-label="${esc(o.title)} afvinken"><span>✓</span></button>` : ""}${R ? "" : lead}<div class="x">${esc(o.title)}<small>${esc(o.sub || "")}</small></div>${R ? lead : ""}${c ? `<i class="dt" style="background:${c}" role="img" aria-label="kleur"></i>` : ""}${o.right || ""}<button class="mo" data-a="${o.ed}" data-i="${esc(o.id)}" data-x="${esc(o.x || "")}" aria-label="${esc(o.title)} bewerken">⋯</button></div>`;
}
const empty = (t, b, a) =>
  `<div class="em"><p>${t}</p><button class="btn" data-a="${a}">${b}</button></div>`;
function fbar(items) {
  const cs = S.cats,
    co = [...new Set(items.map((o) => o.p.color).filter(Boolean))];
  if (!cs.length && co.length < 2) return "";
  return `<div class="row sc" role="group" aria-label="Filter"><button class="ch ${!F.cat && !F.col ? "a" : ""}" data-a="fx0">Alles</button>${cs.map((c) => `<button class="ch ${F.cat === c.id ? "a" : ""}" data-a="fc" data-i="${c.id}">${esc(c.n)}</button>`).join("")}${co.map((c) => `<button class="sw ${F.col === c ? "a" : ""}" style="background:${c}" data-a="fk" data-i="${c}" aria-label="Filter op kleur ${c}"></button>`).join("")}</div>`;
}
function rRoutine() {
  const t = today(),
    day = R === "vandaag",
    all = moments(vd, 1),
    dn = all.filter((m) => S.done[m.k]).length;
  const nav =
    nb('dm" data-i="-1', "Vorige " + (day ? "dag" : "week"), "‹") +
    nb('dm" data-i="1', "Volgende " + (day ? "dag" : "week"), "›") +
    (vd !== t ? `<button class="gear" data-a="dt">Vandaag</button>` : "");
  let h = hd(
    fmt(vd, { weekday: "long", day: "numeric", month: "long" }),
    day ? Core.dateTitle(vd) : "Week",
    nav,
  );
  if (day)
    h += `<div class="cd"><div style="display:flex;justify-content:space-between"><span id="pgt">${all.length ? `${dn} van ${all.length} momenten` : "Niet van toepassing"}</span>${all.length ? `<span class="p" id="pgp">${Math.round((dn / all.length) * 100)}%</span>` : ""}</div>${all.length ? `<div class="tr"><div class="fl" id="pgb" data-bk="pg" style="width:${(dn / all.length) * 100}%"></div></div>` : '<div class="m">Geen gewoontemomenten gepland.</div>'}</div>`;
  h += `<div class="sg"><button class="${day ? "a" : ""}" data-a="rv" data-i="vandaag">Vandaag</button><button class="${day ? "" : "a"}" data-a="rv" data-i="week">Week</button></div>`;
  return (
    h +
    (day
      ? `<div class="f"><label for="rdate">Routinedatum</label><input id="rdate" type="date" value="${vd}"></div>` +
        rDay()
      : rWeek())
  );
}
function rDay() {
  if (!S.habits.length)
    return (
      empty("Nog geen gewoontes.", "Eerste gewoonte toevoegen", "nh") +
      routineEvents()
    );
  const ms = moments(vd);
  let h = fbar(S.habits);
  for (const [pk, pl] of PARTS) {
    const g = ms.filter((m) => m.part === pk);
    h +=
      `<section class="habit-group" data-part="${pk}"><div class="t">${pl}</div>` +
      (g.length
        ? g
            .map(
              (m) =>
                `<div data-habit-row="${m.h.id}" data-moment="${m.i}">${row({ id: m.k, a: "tog", ed: "eh", x: m.h.id, ck: !!S.done[m.k], title: m.h.n + (m.lab ? ` · ${m.lab}` : m.c > 1 ? ` · ${m.i}/${m.c}` : ""), sub: [m.v.time, Core.durationLabel(m.v.duration), m.h.desc].filter(Boolean).join(" · "), p: m.h.p, right: `<button class="drag-handle" data-drag="${m.h.id}" data-moment="${m.i}" aria-label="${esc(m.h.n)} verslepen" title="Houd ingedrukt om te slepen">⠿</button>` })}</div>`,
            )
            .join("")
        : '<div class="drop-empty m">Geen momenten</div>') +
      "</section>";
  }
  if (!ms.length)
    h += '<div class="cd m">Voor deze dag zijn geen momenten gepland.</div>';
  h += routineEvents();
  const par = S.habits.filter((h) => h.st !== "actief" || h.start > vd);
  if (par.length)
    h +=
      `<div class="t">Gepauzeerd of gearchiveerd</div>` +
      par
        .map((h) =>
          row({
            id: h.id,
            ed: "eh",
            x: h.id,
            title: h.n,
            sub: h.start > vd ? "Start op " + h.start : h.st,
            p: h.p,
          }),
        )
        .join("");
  return h;
}
function routineEvents() {
  const ev = occ(vd);
  return (
    `<div class="t">Afspraken</div>` +
    (ev.length
      ? ev
          .map((o) =>
            row({
              id: o.e.id,
              x: o.d,
              ed: "ee",
              title: o.e.t,
              sub: o.e.allday ? "Hele dag" : o.s,
              p: o.e.p,
            }),
          )
          .join("")
      : '<div class="cd s">Niets gepland</div>')
  );
}
const gact = (g, w) => {
  const e = add(w, 6);
  return !(
    g.start > e ||
    (g.ae && g.ae < w) ||
    (g.pz || []).some((z) => w >= z.from && (!z.to || e < z.to))
  );
};
function hst(h, m) {
  const t = today();
  h.pz = h.pz || [];
  if (m === "p") {
    h.st = "pauze";
    h.pz.push({ from: t, to: "" });
  } else if (m === "a") {
    h.st = "archief";
    h.ae = t;
  } else {
    if (h.st === "archief") {
      h.pz.push({ from: add(h.ae, 1), to: t });
      h.ae = "";
    } else {
      const z = h.pz[h.pz.length - 1];
      if (z && !z.to) z.to = t;
    }
    h.st = "actief";
  }
}
const wsum = (g, w) =>
  S.logs
    .filter((l) => l.gid === g.id && l.d >= w && l.d <= add(w, 6))
    .reduce((a, l) => a + Number(l.a), 0);
function rWeek() {
  const w = mon(vd),
    e = add(w, 6),
    gs = S.goals.filter((g) => gact(g, w) && pass(g));
  let h =
    fbar(S.goals) +
    `<div class="m" style="margin:4px 6px 8px">${fmt(w, { day: "numeric", month: "short" })} – ${fmt(e, { day: "numeric", month: "short" })}</div>`;
  if (!S.goals.length)
    return h + empty("Nog geen weekdoelen.", "Eerste weekdoel toevoegen", "ng");
  for (const g of gs) {
    const tg = ver(g, e).target,
      tot = wsum(g, w),
      u = " " + Core.goalUnit(g, e),
      pc = Math.min(100, Math.round((tot / tg) * 100));
    h += row({
      id: g.id,
      ed: "eg",
      title: g.n,
      sub: `${Math.round(tot * 10) / 10} van ${tg}${u} · ${pc}%`,
      p: g.p,
      right: `<button class="p" style="min-height:44px;border:0" data-a="lg" data-i="${g.id}">${"+ " + Core.goalUnit(g, e)}</button>`,
    });
    h += `<div class="tr" style="margin:-2px 14px 10px"><div class="fl" data-bk="gb${g.id}" style="width:${pc}%"></div></div>`;
  }
  const lg = S.logs
    .filter((l) => l.d >= w && l.d <= e && gs.some((g) => g.id === l.gid))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  h +=
    `<div class="t">Registraties deze week</div>` +
    (lg.length
      ? lg
          .map((l) => {
            const g = S.goals.find((x) => x.id === l.gid);
            return row({
              id: l.id,
              ed: "el",
              title: `${g.n}: ${l.a}${" " + Core.goalUnit(g, l.d)}`,
              sub: fmt(l.d, {
                weekday: "long",
                day: "numeric",
                month: "short",
              }),
              p: {},
            });
          })
          .join("")
      : '<div class="cd s">Nog niets geregistreerd.</div>');
  const inactive = S.goals.filter((g) => !gact(g, w) && pass(g));
  if (inactive.length)
    h +=
      '<div class="t">Overige weekdoelen</div>' +
      inactive
        .map((g) =>
          row({
            id: g.id,
            ed: "eg",
            title: g.n,
            sub: g.st === "actief" ? "Start op " + g.start : g.st,
            p: g.p,
          }),
        )
        .join("");
  return h;
}
function rAgendaDay() {
  return (
    hd(
      fmt(ad, { weekday: "long", day: "numeric", month: "long" }),
      Core.dateTitle(ad),
      nb('aw" data-i="-1', "Vorige dag", "‹") +
        nb('aw" data-i="1', "Volgende dag", "›"),
    ) +
    avs() +
    fbar(S.events) +
    `<div class="f"><label for="gd">Ga naar datum</label><input type="date" id="gd" value="${ad}"></div>` +
    mdHTML()
  );
}
function rAgenda() {
  if (AV === "dag") return rAgendaDay();
  if (AV === "maand") return rMonth();
  const w = mon(ad),
    t = today();
  let h = hd(
    fmt(ad, { month: "long", year: "numeric" }),
    "Agenda",
    nb('aw" data-i="-7', "Vorige week", "‹") +
      nb('aw" data-i="7', "Volgende week", "›") +
      `<button class="gear" data-a="at">Vandaag</button>`,
  );
  h +=
    avs() +
    fbar(S.events) +
    `<div class="wk">${ALL.map((i) => {
      const d = add(w, i);
      return `<button class="${d === ad ? "a" : ""}" data-a="sd" data-i="${d}" aria-label="${fmt(d, { weekday: "long", day: "numeric", month: "long" })}">${DN[i]}<b>${+d.slice(8)}</b></button>`;
    }).join(
      "",
    )}</div><div class="f"><label for="gd">Ga naar datum</label><input id="gd" type="date" value="${ad}"></div>`;
  for (const i of ALL) {
    const d = add(w, i),
      o = occ(d);
    h +=
      `<div class="t ${d === ad ? "sel" : ""}" data-d="${d}">${fmt(d, { weekday: "long", day: "numeric", month: "short" })}${d === t ? " · vandaag" : ""}</div>` +
      (o.length
        ? o
            .map((x) =>
              row({
                id: x.e.id,
                x: d,
                a: "ek",
                ed: "ee",
                ck: !!S.edone[x.e.id + "|" + d],
                title: x.e.t,
                sub: [
                  x.e.allday
                    ? "Hele dag"
                    : [x.s, x.end || ""].filter(Boolean).join("–"),
                  x.e.loc,
                ]
                  .filter(Boolean)
                  .join(" · "),
                p: x.e.p,
              }),
            )
            .join("")
        : '<div class="cd s">Niets gepland</div>');
  }
  return h;
}
const isPlanned = (i) =>
  S.events.some((e) => e.id === i.eid) || S.habits.some((h) => h.id === i.hid);
function rTaken() {
  let h =
    hd("Ruimte voor wat nog komt", "Taken") +
    fbar(S.lists.flatMap((l) => l.items));
  h += `<div class="f"><label for="task-category">Categorie</label><select id="task-category"><option value="">Alle categorieën</option>${S.lists.map((l) => `<option value="${l.id}" ${TF.list === l.id ? "selected" : ""}>${esc(l.n)}</option>`).join("")}</select></div><div class="sg">${[
    ["", "Alles"],
    ["open", "Open"],
    ["gepland", "Gepland"],
    ["klaar", "Voltooid"],
  ]
    .map(
      ([id, n]) =>
        `<button data-a="task-status" data-i="${id}" class="${TF.status === id ? "a" : ""}">${n}</button>`,
    )
    .join(
      "",
    )}</div><button class="btn" data-a="nl">+ Categorie toevoegen</button>`;
  if (!S.lists.length)
    return (
      h +
      empty(
        "Nog geen taken. Maak je eigen categorie of gebruik de standaardcategorieën.",
        "Standaardcategorieën toevoegen",
        "task-defaults",
      )
    );
  for (const l of S.lists) {
    if (TF.list && TF.list !== l.id) continue;
    const it = l.items
        .filter(
          (i) =>
            pass(i) &&
            (!S.set.hideDone || !i.done) &&
            (!TF.status ||
              (TF.status === "klaar"
                ? i.done
                : TF.status === "gepland"
                  ? isPlanned(i)
                  : !i.done && !isPlanned(i))),
        )
        .slice()
        .sort((a, b) => Number(!!a.done) - Number(!!b.done)),
      dn = l.items.filter((i) => i.done).length;
    h += `<div class="task-heading"><button class="list-title" data-a="tl" data-i="${l.id}" aria-expanded="${!OP[l.id]}">${OP[l.id] ? "▸" : "▾"} ${esc(l.n)} <span class="m">${dn}/${l.items.length}</span></button><button class="mo" data-a="lm" data-i="${l.id}" aria-label="Categorie ${esc(l.n)} beheren">⋯</button></div>`;
    if (!OP[l.id])
      h +=
        it
          .map((i) =>
            row({
              id: i.id,
              x: l.id,
              a: "ti",
              ed: "ei",
              ck: !!i.done,
              title: i.t,
              sub: [
                i.eid && S.events.some((e) => e.id === i.eid)
                  ? "Gepland in Agenda"
                  : i.hid && S.habits.some((h) => h.id === i.hid)
                    ? "Ingepland in Routine"
                    : "",
                i.note,
              ]
                .filter(Boolean)
                .join(" · "),
              p: i.p,
            }),
          )
          .join("") +
        `<button class="btn" data-a="ni" data-i="${l.id}">+ Taak toevoegen</button>`;
  }
  return h;
}
const welcome = () =>
  `<div class="em" style="padding-top:20vh"><h1>Dagritme</h1><p>Je gegevens blijven op deze iPhone. Hoe wil je beginnen?</p><button class="btn" data-a="st">Leeg beginnen</button><button class="btn" style="background:var(--cd)" data-a="im1">JSON-back-up importeren</button>${legacyBackup ? '<button class="btn" data-a="legacy-copy">Bestaande lokale gegevens kopiëren</button>' : ""}</div>`;
const FAB = {
    routine: () => (R === "vandaag" ? "nh" : "ng"),
    agenda: () => "ne",
    taken: () => "fl",
    notities: () => "nn",
  },
  TABS = ["routine", "agenda", "taken", "notities", "inzicht"],
  RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let VK = "",
  PD = 0;
const vkey = () =>
  T +
  "|" +
  ({
    routine: R + vd,
    agenda: AV + (AV === "maand" ? ad.slice(0, 7) : mon(ad)),
    inzicht: IR + IM,
    notities: NV + ND,
  }[T] || "");
function chrome() {
  document.body.classList.toggle("nonav", !S.started);
  const n = $o("nav");
  n.style.setProperty("--i", Math.max(0, TABS.indexOf(T)));
  n.querySelectorAll("button").forEach((b) => {
    const a = b.dataset.i === T;
    b.classList.toggle("a", a);
    a
      ? b.setAttribute("aria-current", "page")
      : b.removeAttribute("aria-current");
  });
  const f = $o("fab"),
    fa = S.started && FAB[T];
  f.classList.toggle("hide", !fa);
  f.tabIndex = fa ? 0 : -1;
  if (fa) f.dataset.a = fa();
}
function render(mode) {
  if (!S.started) {
    app.innerHTML = welcome();
    chrome();
    VK = "";
    return;
  }
  const key = vkey(),
    same = key === VK && mode !== "page",
    old = new Map(),
    bw = new Map(),
    sy = scrollY;
  if (same) {
    app
      .querySelectorAll("[data-f]")
      .forEach((e) => old.set(e.dataset.f, e.getBoundingClientRect().top + sy));
    app
      .querySelectorAll("[data-bk]")
      .forEach((e) => bw.set(e.dataset.bk, e.style.width));
  }
  app.innerHTML = {
    routine: rRoutine,
    agenda: rAgenda,
    taken: rTaken,
    notities: rNotes,
    inzicht: rInzicht,
  }[T]();
  chrome();
  if (!RM()) {
    if (same) {
      const mv = [];
      app.querySelectorAll("[data-f]").forEach((e) => {
        const o = old.get(e.dataset.f);
        if (o == null) e.classList.add("in");
        else {
          const dy = o - (e.getBoundingClientRect().top + scrollY);
          if (Math.abs(dy) > 1) {
            e.style.transition = "none";
            e.style.transform = `translateY(${dy}px)`;
            mv.push(e);
          }
        }
      });
      if (mv.length) {
        void app.offsetHeight;
        mv.forEach((e) => {
          e.style.transition = "transform .32s cubic-bezier(.32,.72,0,1)";
          e.style.transform = "";
          e.addEventListener("transitionend", () => (e.style.transition = ""), {
            once: true,
          });
        });
      }
      app.querySelectorAll("[data-bk]").forEach((e) => {
        const k = e.dataset.bk,
          nw = e.style.width;
        if (bw.has(k) && bw.get(k) !== nw) {
          e.style.width = bw.get(k);
          void e.offsetWidth;
          e.style.width = nw;
        }
      });
    } else {
      app.style.setProperty("--dx", PD * 18 + "px");
      app.classList.remove("pgi");
      void app.offsetWidth;
      app.classList.add("pgi");
    }
  }
  PD = 0;
  VK = key;
}
// Render now: an older completed write must never repaint a newer selection.
const commit = (ph) => {
  render();
  return save(ph);
};
/* formulieren */
function colorUI(k, cur) {
  return `<div class="row">${COL.map((c) => `<button type="button" class="sw ${cur === c ? "a" : ""}" style="background:${c}" data-a="pc" data-k="${k}" data-i="${c}" aria-label="Kleur ${c}"></button>`).join("")}<label class="sw" style="background:conic-gradient(#d9803a,#4f8f6c,#4a78d6,#8466c8,#d9803a);position:relative;overflow:hidden"><span class="m" style="position:absolute;opacity:0">Eigen kleur</span><input type="color" data-k="${k}" data-c="1" value="${cur || "#8e2440"}" style="position:absolute;inset:0;opacity:0;min-height:0" aria-label="Eigen kleur"></label><button type="button" class="ch ${cur ? "" : "a"}" style="flex:none" data-a="pc" data-k="${k}" data-i="">Geen</button></div>`;
}
function iconGrid(p) {
  const q = (FM?.iconQuery || "").toLocaleLowerCase("nl");
  return (
    Object.keys(IC)
      .filter(
        (n) =>
          (!q ||
            (n + " " + (ICONS[n]?.[1] || ""))
              .toLocaleLowerCase("nl")
              .includes(q)) &&
          (!FM?.iconCategory || ICONS[n]?.[0] === FM.iconCategory),
      )
      .map(
        (n) =>
          `<button type="button" class="ic ${p.icon === n ? "a" : ""}" data-a="pi" data-i="${n}" aria-pressed="${p.icon === n}" aria-label="Icoon ${esc(ICONS[n]?.[1] || n)}">${svg(n)}</button>`,
      )
      .join("") +
    `<button type="button" class="ch ${p.icon ? "" : "a"}" data-a="pi" data-i="">Geen</button>`
  );
}
function look(v) {
  const p = v.p,
    ph = p.photo && P[p.photo];
  return (
    pvHTML(v) +
    `<div class="f"><label>Foto (klein, alleen op deze iPhone)</label><div class="row">${ph ? `<img class="th" src="${ph}" alt="">` : ""}<span class="ph"><span class="btn" style="width:auto;display:flex;align-items:center">${ph ? "Foto wijzigen" : "Foto kiezen"}</span><input type="file" accept="image/*" data-ph="1" aria-label="Foto kiezen"></span>${ph ? '<button type="button" class="btn" style="width:auto" data-a="pd">Foto verwijderen</button>' : ""}</div></div>
 <div class="f"><label for="icon-search">Icoon zoeken</label><input id="icon-search" type="search" placeholder="Bijvoorbeeld sport, studie, huis" value="${esc(FM?.iconQuery || "")}"><label for="icon-category">Icooncategorie</label><select id="icon-category"><option value="">Alle iconen</option>${[...new Set(Object.values(ICONS).map((v) => v[0]))].map((n) => `<option ${FM?.iconCategory === n ? "selected" : ""}>${n}</option>`).join("")}</select><div class="row icon-grid" id="icon-grid">${iconGrid(p)}</div></div>
 <div class="f"><label>Plaats van foto of icoon</label><div class="sg"><button type="button" class="${p.side === "r" ? "" : "a"}" data-a="ps" data-i="l">Links</button><button type="button" class="${p.side === "r" ? "a" : ""}" data-a="ps" data-i="r">Rechts</button></div></div>
 <div class="f"><label>Kleur</label>${colorUI("p.color", p.color)}</div>
 <div class="f"><label for="fc">Categorie</label><select id="fc" data-k="p.cat"><option value="">Geen</option>${S.cats.map((c) => `<option value="${c.id}" ${p.cat === c.id ? "selected" : ""}>${esc(c.n)}</option>`).join("")}<option value="__new">Nieuwe categorie…</option></select></div>`
  );
}
function fld(f, v) {
  const id = "f_" + f.k;
  let h = "";
  const val = v[f.k] ?? "";
  if (f.t === "text" || f.t === "date" || f.t === "time" || f.t === "number")
    h = `<input id="${id}" data-k="${f.k}" type="${f.t}" ${["n", "t", "title"].includes(f.k) ? 'maxlength="160"' : ""} value="${esc(val)}" ${f.t === "number" ? 'inputmode="decimal" step="any" min="0"' : ""}${f.min ? ` min="${f.min}"` : ""}>`;
  else if (f.t === "area")
    h = `<textarea id="${id}" data-k="${f.k}">${esc(val)}</textarea>`;
  else if (f.t === "sel")
    h = `<select id="${id}" data-k="${f.k}" data-re="${f.re ? 1 : ""}">${(typeof f.o === "function" ? f.o(v) : f.o).map(([a, b]) => `<option value="${a}" ${a == val ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>`;
  else if (f.t === "days")
    h = `<div class="row">${ALL.map((i) => `<button type="button" class="ch ${v[f.k].includes(i) ? "a" : ""}" style="flex:none;min-width:44px" aria-pressed="${v[f.k].includes(i)}" data-a="fd" data-k="${f.k}" data-i="${i}">${DN[i]}</button>`).join("")}</div>`;
  else if (f.t === "times")
    h = `<div class="tg">${ALL.map((i) => `<label>${DN[i]} begintijd<input type="time" data-k="tm" data-j="${i}" value="${esc(v.tm?.[i] || "")}"></label><label>${DN[i]} eindtijd<input type="time" data-k="te" data-j="${i}" value="${esc(v.te?.[i] || "")}"></label>`).join("")}</div>`;
  else if (f.t === "directRem") h = directRemUI(v);
  else if (f.t === "color") h = colorUI(f.k, val);
  else if (f.t === "pw")
    h = `<input id="${id}" data-k="${f.k}" type="password" autocomplete="off" autocapitalize="off" value="${esc(val)}">`;
  else if (f.t === "info") return f.h(v);
  else if (f.t === "rem") h = remUI(v);
  else if (f.t === "hrem") h = hremUI(v);
  else return look(v);
  return `<div class="f"><label for="${id}">${f.l || ""}</label>${h}</div>`;
}
/* lagen: bottom sheets en menu's */
const LAY = [];
let E = false,
  lastFocus = null;
function layersUpdate() {
  const L = LAY.length;
  document.documentElement.classList.toggle("lock", L > 0);
  for (const e of [app, $o("nav"), $o("fab")]) e.inert = L > 0;
  $o("sh").inert = LAY[LAY.length - 1] === "mn";
  if (!L)
    document
      .querySelectorAll(".ov.open")
      .forEach((o) => o.classList.remove("open"));
}
function layerOpen(id) {
  clearTimeout(layerClose.timers?.[id]);
  if (LAY.includes(id)) return;
  const el = $o(id);
  LAY.push(id);
  if (!E) {
    history.pushState({ dr: 1 }, "");
    E = true;
  }
  if (LAY.length === 1) lastFocus = document.activeElement;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  layersUpdate();
  const c = el.firstElementChild;
  setTimeout(() => {
    if (LAY.at(-1) === id) c.focus({ preventScroll: true });
  }, 40);
}
function layerClose(id) {
  const i = LAY.indexOf(id);
  if (i < 0) return;
  LAY.splice(i, 1);
  const el = $o(id);
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  layersUpdate();
  if (!LAY.length && lastFocus && document.contains(lastFocus))
    try {
      lastFocus.focus({ preventScroll: true });
    } catch {}
  (layerClose.timers ||= {})[id] = setTimeout(() => {
    if (!el.classList.contains("open")) el.firstElementChild.innerHTML = "";
  }, 320);
}
function tryClose(id) {
  if (id === "mn") return shut();
  if (FM && FM.dirty && !confirm("Wijzigingen weggooien?")) return;
  closeForm();
}
addEventListener("popstate", () => {
  E = false;
  const top = LAY[LAY.length - 1];
  if (!top) return;
  if (top === "sh" && FM && FM.dirty && !confirm("Wijzigingen weggooien?")) {
    history.pushState({ dr: 1 }, "");
    E = true;
    return;
  }
  if (top === "sh") FM = null;
  layerClose(top);
  if (LAY.length) {
    history.pushState({ dr: 1 }, "");
    E = true;
  }
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && LAY.length) tryClose(LAY.at(-1));
  if (e.key === "Tab" && LAY.length) {
    const sheet = $o(LAY.at(-1)).firstElementChild,
      els = [
        ...sheet.querySelectorAll(
          'button,input,select,textarea,[tabindex="0"]',
        ),
      ].filter((x) => !x.disabled && x.getClientRects().length);
    if (!els.length) return;
    const first = els[0],
      last = els.at(-1);
    if (
      e.shiftKey &&
      (document.activeElement === first || document.activeElement === sheet)
    ) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
["sh", "mn"].forEach((id) =>
  $o(id).addEventListener("click", (e) => {
    if (e.target.id === id) tryClose(id);
  }),
);
(() => {
  let y0 = 0,
    dy = 0,
    on = 0,
    el;
  document.addEventListener(
    "touchstart",
    (e) => {
      const g = e.target.closest(".grab");
      if (!g) return;
      el = g.closest(".sheet");
      y0 = e.touches[0].clientY;
      on = 1;
      dy = 0;
      el.style.transition = "none";
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (!on) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      el.style.transform = `translateY(${dy}px)`;
    },
    { passive: true },
  );
  const end = () => {
    if (!on) return;
    on = 0;
    el.style.transition = "";
    el.style.transform = "";
    if (dy > 90) tryClose(el.closest(".ov").id);
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
})();
const pvHTML = (v) => {
  const p = v.p,
    ph = p.photo && P[p.photo],
    lead = ph
      ? `<img class="th" src="${ph}" alt="">`
      : p.icon
        ? `<span class="i" style="background:${p.color || "#2c2c30"}">${svg(p.icon)}</span>`
        : "";
  return `<div class="pv ${FM && FM.pop ? "pop" : ""}" aria-hidden="true"><div class="r">${p.side === "r" ? "" : lead}<div class="x">${esc(v.n || v.t || v.title || "Voorbeeld")}<small>Zo ziet het eruit</small></div>${p.side === "r" ? lead : ""}${p.color ? `<i class="dt" style="background:${p.color}"></i>` : ""}</div></div>`;
};
function sheet(chg) {
  const o = FM;
  if (!o) return;
  if (chg) o.dirty = 1;
  const c = $o("shc"),
    y = c.scrollTop,
    fid = document.activeElement && document.activeElement.id;
  c.setAttribute("aria-label", o.title);
  c.innerHTML = `<div class="grab" aria-hidden="true"></div><h2>${esc(o.title)}</h2>${o.f
    .filter((f) => !f.if || f.if(o.v))
    .map((f) => fld(f, o.v))
    .join(
      "",
    )}${(o.x || []).map((x, i) => `<button type="button" class="btn ${x.c || ""}" data-a="fe" data-i="${i}">${esc(x.l)}</button>`).join("")}<div class="bar"><button class="btn" data-a="fx">Annuleren</button><button class="btn pri" data-a="fs">Opslaan</button></div>`;
  c.scrollTop = y;
  o.pop = false;
  layerOpen("sh");
  if (fid && fid.startsWith("f_")) {
    const e = $o(fid);
    e && e.focus({ preventScroll: true });
  }
}
function form(o) {
  o.v = structuredClone(o.v || {});
  o.v.p = o.v.p || {};
  FM = o;
  sheet();
}
const closeForm = () => {
  FM = null;
  layerClose("sh");
};
function menu(t, o) {
  menu.o = o;
  const c = $o("mnc");
  c.setAttribute("aria-label", t);
  c.innerHTML = `<div class="grab" aria-hidden="true"></div><h2>${esc(t)}</h2>${o.map(([l, f, k], i) => `<button class="btn ${k || ""}" data-a="mn" data-i="${i}">${esc(l)}</button>`).join("")}<button class="btn" data-a="mx">Annuleren</button>`;
  layerOpen("mn");
}
const shut = () => layerClose("mn");
function small(img) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => {
      const i = new Image();
      i.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const x = c.getContext("2d"),
          m = Math.min(i.width, i.height);
        x.drawImage(
          i,
          (i.width - m) / 2,
          (i.height - m) / 2,
          m,
          m,
          0,
          0,
          128,
          128,
        );
        ok(c.toDataURL("image/jpeg", 0.7));
      };
      i.onerror = no;
      i.src = r.result;
    };
    r.onerror = no;
    r.readAsDataURL(img);
  });
}
const setPath = (k, val) => {
  const [a, b] = k.split(".");
  b ? (FM.v[a][b] = val) : (FM.v[a] = val);
};
/* acties */
const find = (a, id) => a.find((x) => x.id === id),
  ord = (a) => a.forEach((x, i) => (x.ord = i));
const mv = (arr, id, d) => {
  const i = arr.findIndex((x) => x.id === id),
    j = i + d;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};
function habitForm(h, pre) {
  const t = today(),
    v = h ? ver(h, t) || h.hist[h.hist.length - 1] : { days: ALL, count: 1 };
  form({
    title: h ? "Gewoonte bewerken" : "Nieuwe gewoonte",
    v: {
      n: h?.n || pre?.t || "",
      desc: h?.desc || pre?.note || "",
      duration: h?.duration || "",
      durationUnit: h?.duration ? "min" : "",
      end: h?.end || "",
      part: h?.part || "ochtend",
      time: h?.time || "",
      cnt: v.count,
      labels: (h?.labels || []).join(", "),
      hrem: [...(h?.hrem || [])],
      days: [...v.days],
      from: h && h.start > t ? h.start : t,
      p: h?.p || pre?.p,
    },
    f: [
      { k: "n", l: "Naam", t: "text" },
      { k: "desc", l: "Beschrijving (optioneel)", t: "area" },
      {
        k: "durationUnit",
        l: "Duur",
        t: "sel",
        re: 1,
        o: [
          ["", "Geen duur"],
          ["min", "Minuten"],
          ["uur", "Uren"],
        ],
      },
      {
        k: "duration",
        l: "Hoe lang?",
        t: "number",
        if: (v) => !!v.durationUnit,
      },
      { k: "end", l: "Einddatum (optioneel)", t: "date" },
      { k: "part", l: "Dagdeel", t: "sel", o: PARTS.map(([a, b]) => [a, b]) },
      { k: "time", l: "Tijd (optioneel)", t: "time" },
      { k: "cnt", l: "Aantal momenten per dag", t: "number" },
      {
        k: "labels",
        l: "Namen van de momenten (optioneel, met komma). “Ochtend, Avond” zet ze in die dagdelen",
        t: "text",
      },
      { k: "days", l: "Actieve weekdagen", t: "days" },
      { k: "from", l: "Wijziging van schema geldt vanaf", t: "date", min: t },
      { k: "hrem", l: "Herinneringen (tijdstippen)", t: "hrem" },
      { k: "p", t: "look" },
    ],
    x: h
      ? [
          ...noteX("h", h.id),
          {
            l: "Omhoog",
            fn: () => {
              S.habits.sort((a, b) => a.ord - b.ord);
              mv(S.habits, h.id, -1);
              ord(S.habits);
              commit();
              toast("Verplaatst");
            },
          },
          {
            l: "Omlaag",
            fn: () => {
              S.habits.sort((a, b) => a.ord - b.ord);
              mv(S.habits, h.id, 1);
              ord(S.habits);
              commit();
              toast("Verplaatst");
            },
          },
          {
            l: h.st === "actief" ? "Pauzeren" : "Hervatten",
            fn: () => {
              hst(h, h.st === "actief" ? "p" : "r");
              closeForm();
              commit();
            },
          },
          ...(h.st === "archief"
            ? []
            : [
                {
                  l: "Archiveren (historie blijft)",
                  fn: () => {
                    hst(h, "a");
                    closeForm();
                    commit();
                  },
                },
              ]),
          {
            l: "Definitief verwijderen",
            c: "del",
            fn: () => {
              if (
                !confirm(
                  `“${h.n}” definitief verwijderen? Dit wist de gewoonte en al haar vinkjes. Notities en afspraken blijven staan.`,
                )
              )
                return;
              S.habits = S.habits.filter((x) => x !== h);
              S.lists.forEach((l) =>
                l.items.forEach((i) => {
                  if (i.hid === h.id) i.hid = null;
                }),
              );
              unlink("h", h.id);
              Object.keys(S.done).forEach(
                (k) => k.split("|")[1] === h.id && delete S.done[k],
              );
              closeForm();
              commit(1);
            },
          },
        ]
      : [],
    save: (v) => {
      const n = v.n.trim(),
        c = Number(v.cnt),
        lbs = (v.labels || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
      if (!n) return toast("Geef een naam", 1);
      if (!Number.isInteger(c) || c < 1 || c > 20)
        return toast("Kies 1 tot 20 uitvoermomenten", 1);
      if (!v.days.length) return toast("Kies minstens één weekdag", 1);
      const f = v.from < t ? t : v.from,
        duration = v.durationUnit
          ? parseFloat(String(v.duration).replace(",", ".")) *
            (v.durationUnit === "uur" ? 60 : 1)
          : null;
      if (
        !Core.validDate(f) ||
        (v.end && (!Core.validDate(v.end) || v.end < f))
      )
        return toast("Controleer de start- en einddatum", 1);
      if (duration !== null && (!(duration > 0) || duration > 10080))
        return toast("Vul een geldige duur in", 1);
      if (!h) {
        const created = {
          id: uid(),
          n,
          desc: v.desc,
          duration,
          end: v.end,
          labels: lbs,
          hrem: v.hrem,
          pz: [],
          part: v.part,
          time: v.time,
          start: f,
          st: "actief",
          ord: S.habits.length,
          p: v.p,
          hist: [
            {
              from: f,
              days: v.days.sort(),
              count: c,
              part: v.part,
              labels: lbs,
              time: v.time,
              duration,
            },
          ],
        };
        S.habits.push(created);
        if (pre?.item) {
          pre.item.hid = created.id;
        }
      } else {
        Object.assign(h, {
          n,
          desc: v.desc,
          end: v.end,
          duration,
          hrem: v.hrem,
          labels: lbs,
          part: v.part,
          time: v.time,
          p: v.p,
        });
        const cur = ver(h, f);
        if (
          !cur ||
          cur.count !== c ||
          cur.days.join() !== v.days.slice().sort().join() ||
          cur.part !== v.part ||
          cur.time !== v.time ||
          cur.duration !== duration ||
          JSON.stringify(cur.labels) !== JSON.stringify(lbs)
        ) {
          h.hist = h.hist.filter((x) => x.from !== f);
          h.hist.push({
            momentParts:
              cur?.part === v.part &&
              JSON.stringify(cur.labels) === JSON.stringify(lbs)
                ? structuredClone(cur.momentParts || {})
                : {},
            from: f,
            days: v.days.sort(),
            count: c,
            part: v.part,
            labels: lbs,
            time: v.time,
            duration,
          });
          h.hist.sort((a, b) => (a.from < b.from ? -1 : 1));
        }
      }
      closeForm();
      commit(1);
    },
  });
}
function goalForm(g) {
  const t = today(),
    e = g ? ver(g, t) || g.hist[0] : { target: 1 };
  form({
    title: g ? "Weekdoel bewerken" : "Nieuw weekdoel",
    v: {
      n: g?.n || "",
      type: g?.type || "aantal",
      target: e.target,
      from: t,
      unit: g?.unit || "",
      hrem: g?.hrem || [],
      p: g?.p,
    },
    f: [
      { k: "n", l: "Naam", t: "text" },
      {
        k: "type",
        l: "Soort",
        t: "sel",
        o: [
          ["aantal", "Aantal keer"],
          ["minuten", "Minuten"],
          ["uren", "Uren"],
          ["km", "Kilometers"],
          ["eigen", "Eigen eenheid"],
        ],
        re: 1,
      },
      {
        k: "unit",
        l: "Eigen eenheid",
        t: "text",
        if: (v) => v.type === "eigen",
      },
      { k: "hrem", l: "Herinneringen (op gekozen weekdagen)", t: "hrem" },
      { k: "target", l: "Doel per week", t: "number" },
      { k: "from", l: "Nieuw doel geldt vanaf", t: "date", min: t },
      { k: "p", t: "look" },
    ],
    x: g
      ? [
          ...noteX("g", g.id),
          {
            l: g.st === "actief" ? "Pauzeren" : "Hervatten",
            fn: () => {
              hst(g, g.st === "actief" ? "p" : "r");
              closeForm();
              commit();
            },
          },
          ...(g.st === "archief"
            ? []
            : [
                {
                  l: "Archiveren (historie blijft)",
                  fn: () => {
                    hst(g, "a");
                    closeForm();
                    commit();
                  },
                },
              ]),
          {
            l: "Definitief verwijderen",
            c: "del",
            fn: () => {
              if (
                !confirm(
                  `“${g.n}” verwijderen? Dit wist het doel en al zijn registraties.`,
                )
              )
                return;
              S.goals = S.goals.filter((x) => x !== g);
              unlink("g", g.id);
              S.logs = S.logs.filter((l) => l.gid !== g.id);
              closeForm();
              commit(1);
            },
          },
        ]
      : [],
    save: (v) => {
      const n = v.n.trim(),
        tg = parseFloat(String(v.target).replace(",", "."));
      if (!n || !(tg > 0)) return toast("Naam en doel zijn nodig", 1);
      const f = v.from < t ? t : v.from;
      if (!Core.validDate(f)) return toast("Kies een geldige startdatum", 1);
      if (!g)
        S.goals.push({
          id: uid(),
          n,
          type: v.type,
          unit: v.unit,
          hrem: v.hrem,
          start: f,
          st: "actief",
          p: v.p,
          hist: [{ from: f, target: tg, type: v.type, unit: v.unit }],
        });
      else {
        Object.assign(g, {
          n,
          type: v.type,
          unit: v.unit,
          hrem: v.hrem,
          p: v.p,
        });
        if (
          ver(g, f)?.target !== tg ||
          ver(g, f)?.type !== v.type ||
          ver(g, f)?.unit !== v.unit
        ) {
          g.hist = g.hist.filter((x) => x.from !== f);
          g.hist.push({ from: f, target: tg, type: v.type, unit: v.unit });
          g.hist.sort((a, b) => (a.from < b.from ? -1 : 1));
        }
      }
      closeForm();
      commit(1);
    },
  });
}
function logForm(g, l) {
  const w = mon(vd),
    d = l ? l.d : today() >= w && today() <= add(w, 6) ? today() : w;
  form({
    title: l ? "Registratie corrigeren" : `${g.n}: toevoegen`,
    v: { a: l ? l.a : g.type === "km" ? "" : 1, d },
    f: [
      {
        k: "a",
        l: "Hoeveel (" + Core.goalUnit(g, l?.d || d) + ")",
        t: "number",
      },
      { k: "d", l: "Datum", t: "date" },
    ],
    x: l
      ? [
          {
            l: "Registratie verwijderen",
            c: "del",
            fn: () => {
              S.logs = S.logs.filter((x) => x !== l);
              closeForm();
              commit();
            },
          },
        ]
      : [],
    save: (v) => {
      const a = parseFloat(String(v.a).replace(",", "."));
      if (!(a > 0) || !Core.validDate(v.d))
        return toast("Vul een bedrag en datum in", 1);
      if (l) {
        l.a = a;
        l.d = v.d;
      } else S.logs.push({ id: uid(), gid: g.id, d: v.d, a });
      closeForm();
      commit();
    },
  });
}
function eventForm(e, d0, pre) {
  const rec = e?.rec;
  form({
    title: e ? "Afspraak bewerken" : "Nieuwe afspraak",
    v: {
      t: e?.t || pre?.t || "",
      duration: e?.duration || "",
      rec: rec ? "w" : "e",
      d: e ? (rec ? d0 : e.d) : pre?.d || ad,
      end: e?.end || "",
      days: [...(e?.days || [])],
      allday: e?.allday ? "1" : "",
      s: e?.s || "",
      e: e?.e || "",
      tm: { ...(e?.tm || {}) },
      te: { ...(e?.te || {}) },
      loc: e?.loc || "",
      note: e?.note || pre?.note || "",
      rem: (e?.rem || []).map((x) => ({ ...x })),
      p: e?.p || pre?.p,
    },
    f: [
      { k: "t", l: "Titel", t: "text" },
      {
        k: "rec",
        l: "Herhaling",
        t: "sel",
        re: 1,
        o: [
          ["e", "Eenmalig"],
          ["w", "Wekelijks"],
        ],
      },
      { k: "d", l: "Datum / startdatum", t: "date" },
      {
        k: "end",
        l: "Einddatum (optioneel)",
        t: "date",
        if: (v) => v.rec === "w",
      },
      { k: "days", l: "Weekdagen", t: "days", if: (v) => v.rec === "w" },
      {
        k: "allday",
        l: "Hele dag",
        t: "sel",
        re: 1,
        o: [
          ["", "Nee"],
          ["1", "Ja"],
        ],
      },
      { k: "s", l: "Begintijd", t: "time", if: (v) => !v.allday },
      { k: "e", l: "Eindtijd", t: "time", if: (v) => !v.allday },
      {
        k: "duration",
        l: "Duur in minuten (optioneel)",
        t: "number",
        if: (v) => !v.allday,
      },
      {
        k: "tm",
        l: "Andere begin- en eindtijd per weekdag (optioneel)",
        t: "times",
        if: (v) => v.rec === "w" && !v.allday,
      },
      { k: "loc", l: "Locatie", t: "text" },
      { k: "note", l: "Notitie", t: "area" },
      { k: "rem", l: "Herinneringen", t: "rem" },
      { k: "p", t: "look" },
    ],
    x: e
      ? [
          ...noteX("e", e.id),
          { l: "Verwijderen", c: "del", fn: () => delEvent(e, d0) },
        ]
      : [],
    save: (v) => {
      const o = {
        t: v.t.trim(),
        duration: v.duration ? Number(v.duration) : null,
        rec: v.rec === "w",
        d: v.d,
        end: v.rec === "w" ? v.end : "",
        days: v.rec === "w" ? v.days.slice().sort() : [],
        allday: !!v.allday,
        s: v.allday ? "" : v.s,
        e: v.allday ? "" : v.e,
        tm:
          v.rec === "w" && !v.allday
            ? Object.fromEntries(
                Object.entries(v.tm || {}).filter(
                  (x) => x[1] && v.days.includes(+x[0]),
                ),
              )
            : {},
        te:
          v.rec === "w" && !v.allday
            ? Object.fromEntries(
                Object.entries(v.te || {}).filter(
                  ([day, time]) => time && v.days.includes(Number(day)),
                ),
              )
            : {},
        loc: v.loc,
        note: v.note,
        rem: v.rem || [],
        p: v.p,
      };
      if (!o.t || !Core.validDate(o.d))
        return toast("Titel en datum zijn nodig", 1);
      if (o.rec && !o.days.length) return toast("Kies minstens één weekdag", 1);
      if (o.duration !== null && (!(o.duration > 0) || o.duration > 1440))
        return toast("Duur moet tussen 1 en 1440 minuten liggen", 1);
      if ((o.s && !Core.validTime(o.s)) || (o.e && !Core.validTime(o.e)))
        return toast("Controleer de tijden", 1);
      if (o.e && o.s && o.e <= o.s)
        return toast("Eindtijd moet na de begintijd liggen", 1);
      if (o.end && (!Core.validDate(o.end) || o.end < o.d))
        return toast("Einddatum ligt voor de startdatum", 1);
      for (const day of o.days) {
        const start = o.tm[day] || o.s,
          end = o.te[day] || o.e;
        if (
          end &&
          start &&
          end <= start &&
          !(!o.te[day] && o.tm[day] && o.e && o.s && o.e > o.s)
        )
          return toast("Controleer begin- en eindtijd op " + DN[day], 1);
      }
      const done = () => {
        closeForm();
        shut();
        commit(1);
      };
      if (!e) {
        const n = { id: uid(), ex: [], ...o };
        S.events.push(n);
        if (pre?.link) {
          pre.link.eid = n.id;
          pre.link.done = false;
        }
        return done();
      }
      if (!e.rec) return (Object.assign(e, o), done());
      menu("Welke afspraken wijzigen?", [
        [
          "Alleen deze afspraak",
          () => {
            e.ex.push(d0);
            S.events.push({
              id: uid(),
              ex: [],
              ...o,
              rec: false,
              days: [],
              end: "",
              tm: {},
              te: {},
              e: o.e === e.e ? e.te?.[dow(d0)] || o.e : o.e,
              from: e.id,
              s: o.s === e.s ? e.tm[dow(d0)] || o.s : o.s,
            });
            done();
          },
        ],
        [
          "Deze en volgende",
          () => {
            if (d0 <= e.d) Object.assign(e, o);
            else {
              const future = e.ex.filter((d) => d >= d0);
              e.ex = e.ex.filter((d) => d < d0);
              e.end = add(d0, -1);
              S.events.push({ id: uid(), ...o, ex: future, from: e.id });
            }
            done();
          },
        ],
        [
          "De hele reeks",
          () => {
            Object.assign(e, o, o.rec ? { d: e.d } : {});
            done();
          },
        ],
      ]);
    },
  });
}
function delEvent(e, d0) {
  const rm = () => {
    S.events = S.events.filter((x) => x !== e);
    S.lists.forEach((l) =>
      l.items.forEach((i) => {
        if (i.eid === e.id) i.eid = null;
      }),
    );
    unlink("e", e.id);
    Object.keys(S.edone).forEach(
      (k) => k.startsWith(e.id) && delete S.edone[k],
    );
    closeForm();
    shut();
    commit(1);
  };
  if (!e.rec) {
    if (
      confirm(
        `“${e.t}” verwijderen? Gekoppelde taaks blijven bestaan zonder planning.`,
      )
    )
      rm();
    return;
  }
  menu("Welke afspraken verwijderen?", [
    [
      "Alleen deze afspraak",
      () => {
        e.ex.push(d0);
        closeForm();
        shut();
        commit();
      },
    ],
    [
      "Deze en volgende",
      () => {
        if (d0 <= e.d) rm();
        else {
          e.end = add(d0, -1);
          closeForm();
          shut();
          commit();
        }
      },
    ],
    ["De hele reeks", rm, "del"],
  ]);
}
function itemForm(l, i) {
  form({
    title: i ? "Item bewerken" : "Nieuw item",
    v: {
      t: i?.t || "",
      note: i?.note || "",
      dest: l.id,
      reminders: i?.reminders || [],
      p: i?.p,
    },
    f: [
      { k: "t", l: "Item", t: "text" },
      { k: "note", l: "Notitie", t: "area" },
      {
        k: "dest",
        l: "Taakcategorie",
        t: "sel",
        o: S.lists.map((x) => [x.id, x.n]),
      },
      { k: "reminders", l: "Herinneringen (datum en tijd)", t: "directRem" },
      { k: "p", t: "look" },
    ],
    x: i
      ? [
          ...noteX("i", i.id),
          ...(!i.hid || !S.habits.some((h) => h.id === i.hid)
            ? [
                {
                  l: "Inplannen als gewoonte",
                  fn: () => {
                    closeForm();
                    habitForm(null, { t: i.t, note: i.note, p: i.p, item: i });
                  },
                },
              ]
            : [
                {
                  l: "Gewoonte bewerken",
                  fn: () => {
                    closeForm();
                    habitForm(find(S.habits, i.hid));
                  },
                },
              ]),
          ...(!S.events.find((e) => e.id === i.eid)
            ? [
                {
                  l: "Inplannen als afspraak",
                  fn: () => {
                    closeForm();
                    eventForm(null, null, {
                      t: i.t,
                      note: i.note,
                      p: i.p,
                      d: today(),
                      link: i,
                    });
                  },
                },
              ]
            : [
                {
                  l: "Planning loskoppelen",
                  fn: () => {
                    i.eid = null;
                    closeForm();
                    commit();
                  },
                },
              ]),
          {
            l: "Omhoog",
            fn: () => {
              mv(l.items, i.id, -1);
              commit();
              toast("Verplaatst");
            },
          },
          {
            l: "Omlaag",
            fn: () => {
              mv(l.items, i.id, 1);
              commit();
              toast("Verplaatst");
            },
          },
          {
            l: "Verwijderen",
            c: "del",
            fn: () => {
              if (!confirm(`“${i.t}” verwijderen?`)) return;
              l.items = l.items.filter((x) => x !== i);
              unlink("i", i.id);
              closeForm();
              commit(1);
            },
          },
        ]
      : [],
    save: (v) => {
      if (!v.t.trim()) return toast("Geef het item een naam", 1);
      const dest = find(S.lists, v.dest) || l;
      if (i) {
        Object.assign(i, {
          t: v.t.trim(),
          note: v.note,
          p: v.p,
          reminders: v.reminders,
        });
        if (dest !== l) {
          l.items = l.items.filter((x) => x !== i);
          dest.items.push(i);
        }
      } else
        dest.items.push({
          id: uid(),
          t: v.t.trim(),
          note: v.note,
          done: false,
          eid: null,
          p: v.p,
          reminders: v.reminders,
        });
      closeForm();
      commit(1);
    },
  });
}
function catForm(c) {
  form({
    title: c ? "Categorie bewerken" : "Nieuwe categorie",
    v: { n: c?.n || "", color: c?.color || "", p: {} },
    f: [
      { k: "n", l: "Naam", t: "text" },
      { k: "color", l: "Kleur (optioneel)", t: "color" },
    ],
    x: c
      ? [
          {
            l: "Verwijderen (items blijven bestaan)",
            c: "del",
            fn: () => {
              S.cats = S.cats.filter((x) => x !== c);
              if (F.cat === c.id) F.cat = "";
              for (const f of Object.values(FILTERS))
                if (f.cat === c.id) f.cat = "";
              [
                ...S.habits,
                ...S.events,
                ...S.goals,
                ...S.lists.flatMap((l) => l.items),
              ].forEach((o) => o.p.cat === c.id && delete o.p.cat);
              closeForm();
              commit(1);
            },
          },
        ]
      : [],
    save: (v) => {
      if (!v.n.trim()) return toast("Geef een naam", 1);
      if (c) {
        c.n = v.n.trim();
        c.color = v.color;
      } else S.cats.push({ id: uid(), n: v.n.trim(), color: v.color });
      closeForm();
      commit();
    },
  });
}
function downloadJSON(data, name) {
  const b = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(b),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exp() {
  if (
    !confirm(
      "Deze back-up bevat persoonlijke gegevens, foto’s en je volledige historie. Bewaar hem privé in Bestanden op je iPhone. Doorgaan?",
    )
  )
    return;
  downloadJSON(Core.backup(S, P), "dagritme-" + today() + ".json");
  toast("Export gemaakt. Bewaar het bestand veilig.");
}
async function applyImport(j) {
  const candidate = Core.validateBackup(j);
  candidate.S.started = true;
  const count = Object.values(S)
    .filter(Array.isArray)
    .reduce((n, a) => n + a.length, 0);
  if (
    !confirm(
      `Back-up importeren: ${candidate.S.habits.length} gewoontes, ${candidate.S.events.length} afspraken, ${candidate.S.lists.reduce((n, l) => n + l.items.length, 0)} taken en ${candidate.S.notes.length} notities. ${count ? "Huidige gegevens worden vervangen; er wordt eerst een lokale herstelkopie bewaard." : "Doorgaan?"}`,
    )
  )
    return;
  await persist(candidate.S, candidate.P, { preImport: Core.backup(S, P) });
  S = candidate.S;
  P = candidate.P;
  F = { cat: "", col: "" };
  FILTERS = {};
  TF = { list: "", status: "" };
  OP = {};
  NF = { q: "", kind: "", status: "", link: null };
  shut();
  closeForm();
  render();
  schedSync();
  toast("Import gelukt; alle historie is meegenomen.");
}
async function imp(f) {
  try {
    if (f.size > 30 * 1024 * 1024)
      throw new Error("Bestand is groter dan 30 MB");
    await applyImport(JSON.parse(await f.text()));
  } catch (e) {
    toast("Import mislukt. Huidige gegevens zijn behouden: " + e.message, 1);
  }
}
function settings() {
  menu("Instellingen", [
    [
      "Meldingen en synchronisatie",
      () => {
        shut();
        notifForm();
      },
    ],
    [
      "Exporteren naar JSON",
      () => {
        shut();
        exp();
      },
    ],
    [
      "Importeren uit JSON",
      () => {
        shut();
        $o("imf").click();
      },
    ],
    [
      "Herstelkopie vóór laatste import",
      async () => {
        try {
          const j = await kvGet("preImport");
          if (!j) return toast("Nog geen herstelkopie", 1);
          shut();
          await applyImport(j);
        } catch (e) {
          toast("Herstellen mislukt: " + e.message, 1);
        }
      },
    ],
    ...(legacyBackup
      ? [
          [
            "Bestaande lokale gegevens kopiëren",
            async () => {
              try {
                await applyImport(legacyBackup);
              } catch (e) {
                toast(e.message, 1);
              }
            },
          ],
        ]
      : []),
    [
      `Volgorde: ${S.set.sort === "tijd" ? "op tijd" : "handmatig"}`,
      () => {
        S.set.sort = S.set.sort === "tijd" ? "handmatig" : "tijd";
        shut();
        commit();
      },
    ],
    [
      `Voltooide taken ${S.set.hideDone ? "tonen" : "verbergen"}`,
      () => {
        S.set.hideDone = !S.set.hideDone;
        shut();
        commit();
      },
    ],
    [
      "Itemcategorieën beheren",
      () => {
        shut();
        menu("Itemcategorieën", [
          ...S.cats.map((c) => [
            c.n,
            () => {
              shut();
              catForm(c);
            },
          ]),
          [
            "+ Nieuwe categorie",
            () => {
              shut();
              catForm();
            },
          ],
        ]);
      },
    ],
    [
      "Losse herinneringen",
      () => {
        shut();
        reminderManager();
      },
    ],
    [
      "Versie, privacy en opslag",
      () => {
        alert(
          `Dagritme ${APPV}. Local-first: gegevens en foto’s staan lokaal in IndexedDB. Geen accounts of automatische cloudback-up. Alleen geplande titels en tijden gaan naar je ingestelde pushserver. Een nieuwe PWA-installatie kan een aparte opslag hebben; zet gegevens altijd veilig over met JSON-export/import. Servercodes worden niet geëxporteerd. Maak regelmatig een privéback-up.`,
        );
      },
    ],
    [
      "Deze app leegmaken",
      async () => {
        if (
          !confirm(
            "Alle gegevens van deze nieuwe app wissen? Maak eerst een JSON-export. De oude app blijft onaangeroerd.",
          )
        )
          return;
        try {
          const empty = blank();
          empty.started = true;
          await persist(empty, {}, { preImport: Core.backup(S, P) });
          S = empty;
          P = {};
          shut();
          render();
          schedSync();
        } catch (e) {
          toast(e.message, 1);
        }
      },
      "del",
    ],
  ]);
}
const ACT = {
  "task-status"(d) {
    TF.status = d.i;
    render();
  },
  "task-defaults"() {
    for (const n of [
      "Halen (spullen)",
      "Gewoontes inplannen",
      "Kamer",
      "Inplannen",
    ])
      if (!S.lists.some((l) => l.n === n))
        S.lists.push({ id: uid(), n, items: [] });
    commit();
  },
  "direct-add"() {
    const r = FM.v._direct;
    if (!Core.validDate(r.d) || !Core.validTime(r.time))
      return toast("Kies een datum en tijd", 1);
    if (!FM.v.reminders.some((x) => x.d === r.d && x.time === r.time))
      FM.v.reminders.push({ id: uid(), d: r.d, time: r.time });
    sheet(1);
  },
  "direct-del"(d) {
    FM.v.reminders.splice(Number(d.i), 1);
    sheet(1);
  },
  nv(d) {
    NV = d.i;
    NF.link = null;
    render();
  },
  ndm(d) {
    ND = add(ND, Number(d.i));
    render();
  },
  ndt() {
    ND = today();
    render();
  },

  "legacy-copy": async () => {
    try {
      await applyImport(legacyBackup);
    } catch (e) {
      toast(e.message, 1);
    }
  },
  st() {
    S.started = true;
    commit();
  },
  im1() {
    document.getElementById("imf").click();
  },
  tab(d) {
    if (d.i === T) return;
    PD = Math.sign(TABS.indexOf(d.i) - TABS.indexOf(T));
    FILTERS[T] = { ...F };
    T = d.i;
    F = FILTERS[T] || { cat: "", col: "" };
    if (T === "notities") {
      ND = today();
      NV = "dag";
      NF.link = null;
    }
    if (T !== "notities") NF.link = null;
    render("page");
    scrollTo(0, 0);
  },
  rv(d) {
    R = d.i;
    render();
  },
  dm(d) {
    PD = Math.sign(+d.i);
    vd = add(vd, (R === "vandaag" ? 1 : 7) * d.i);
    render();
  },
  dt() {
    vd = today();
    render();
  },
  aw(d) {
    PD = Math.sign(+d.i);
    ad =
      AV === "maand"
        ? mshift(ad.slice(0, 7), +d.i > 0 ? 1 : -1) + "-01"
        : add(ad, +d.i);
    render();
  },
  av(d) {
    AV = d.i;
    render();
  },
  at() {
    ad = today();
    render();
  },
  sd(d) {
    const prev = ad;
    ad = d.i;
    if (AV === "dag") return render();
    if (T !== "agenda") return render();
    if (AV === "week") {
      app
        .querySelectorAll(".wk button")
        .forEach((b) => b.classList.toggle("a", b.dataset.i === ad));
      app
        .querySelectorAll(".t[data-d]")
        .forEach((t) => t.classList.toggle("sel", t.dataset.d === ad));
      const t = app.querySelector(`.t[data-d="${ad}"]`);
      t &&
        t.scrollIntoView({
          behavior: RM() ? "auto" : "smooth",
          block: "start",
        });
      const g = $o("gd");
      if (g) g.value = ad;
      return;
    }
    if (ad.slice(0, 7) !== prev.slice(0, 7)) {
      PD = ad > prev ? 1 : -1;
      return render("page");
    }
    app
      .querySelectorAll(".cl")
      .forEach((b) => b.classList.toggle("a", b.dataset.i === ad));
    const m = $o("md");
    m.innerHTML = mdHTML();
    m.classList.remove("pgi");
    void m.offsetWidth;
    m.classList.add("pgi");
  },
  tog(d, b) {
    const on = !S.done[d.i];
    on ? (S.done[d.i] = 1) : delete S.done[d.i];
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    prog();
    save();
  },
  ek(d, b) {
    const k = d.i + "|" + d.x,
      on = !S.edone[k];
    on ? (S.edone[k] = 1) : delete S.edone[k];
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    save();
  },
  ti(d, b) {
    const l = find(S.lists, d.x),
      i = find(l.items, d.i);
    i.done = !i.done;
    b.classList.toggle("on", i.done);
    b.setAttribute("aria-pressed", i.done);
    save();
    render();
  },
  nh() {
    habitForm();
  },
  eh(d) {
    habitForm(find(S.habits, d.x || d.i));
  },
  ng() {
    goalForm();
  },
  eg(d) {
    goalForm(find(S.goals, d.i));
  },
  lg(d) {
    logForm(find(S.goals, d.i));
  },
  el(d) {
    const l = find(S.logs, d.i);
    logForm(find(S.goals, l.gid), l);
  },
  ne() {
    eventForm();
  },
  ee(d) {
    eventForm(find(S.events, d.i), d.x);
  },
  nl() {
    const n = prompt("Naam van de categorie");
    if (n && n.trim()) {
      S.lists.push({ id: uid(), n: n.trim(), items: [] });
      TF.list = S.lists.at(-1).id;
      commit();
    }
  },
  ni(d) {
    itemForm(find(S.lists, d.i));
  },
  ei(d) {
    itemForm(find(S.lists, d.x), find(find(S.lists, d.x).items, d.i));
  },
  fl() {
    menu("Toevoegen", [
      ...S.lists.map((l) => [
        "Item in " + l.n,
        () => {
          shut();
          itemForm(l);
        },
      ]),
      [
        "Nieuwe categorie",
        () => {
          shut();
          ACT.nl();
        },
      ],
    ]);
  },
  tl(d) {
    OP[d.i] = !OP[d.i];
    render();
  },
  lm(d) {
    const l = find(S.lists, d.i);
    menu(l.n, [
      [
        "Hernoemen",
        () => {
          shut();
          const n = prompt("Nieuwe naam", l.n);
          if (n && n.trim()) {
            l.n = n.trim();
            commit();
          }
        },
      ],
      [
        "Omhoog",
        () => {
          mv(S.lists, l.id, -1);
          shut();
          commit();
        },
      ],
      [
        "Omlaag",
        () => {
          mv(S.lists, l.id, 1);
          shut();
          commit();
        },
      ],
      [
        "Categorie verwijderen",
        () => {
          shut();
          if (
            confirm(
              `Categorie “${l.n}” met ${l.items.length} items verwijderen?`,
            )
          ) {
            l.items.forEach((i) => unlink("i", i.id));
            S.lists = S.lists.filter((x) => x !== l);
            if (TF.list === l.id) TF.list = "";
            commit(1);
          }
        },
        "del",
      ],
    ]);
  },
  set: settings,
  fc(d) {
    F = { ...F, cat: F.cat === d.i ? "" : d.i };
    render();
  },
  fk(d) {
    F = { ...F, col: F.col === d.i ? "" : d.i };
    render();
  },
  fx0() {
    F = { cat: "", col: "" };
    render();
  },
  fx() {
    tryClose("sh");
  },
  fd(d) {
    const a = FM.v[d.k],
      i = +d.i;
    a.includes(i) ? a.splice(a.indexOf(i), 1) : a.push(i);
    sheet(1);
  },
  pc(d) {
    setPath(d.k, d.i);
    FM.pop = 1;
    sheet(1);
  },
  pi(d) {
    FM.v.p.icon = d.i;
    FM.pop = 1;
    sheet(1);
  },
  ps(d) {
    FM.v.p.side = d.i;
    FM.pop = 1;
    sheet(1);
  },
  pd() {
    delete FM.v.p.photo;
    FM.pop = 1;
    sheet(1);
  },
  ra() {
    const r = FM.v._r,
      m = Number(r.min === "x" ? r.cu : r.min);
    if (!Number.isFinite(m) || m < 0 || m > 20160)
      return toast("Kies 0 tot 14 dagen van tevoren", 1);
    if (r.sc === "date" && !r.date) return toast("Kies een datum", 1);
    FM.v.rem.push({
      id: uid(),
      min: m,
      dow: r.sc === "dow" ? +r.dow : null,
      date: r.sc === "date" ? r.date : null,
    });
    sheet(1);
  },
  rd(d) {
    FM.v.rem.splice(+d.i, 1);
    sheet(1);
  },
  ha() {
    const r = FM.v._r;
    if (!Core.validTime(r.t)) return toast("Kies een tijd", 1);
    const moment = r.moment ? Number(r.moment) : null;
    if (
      moment !== null &&
      (!Number.isInteger(moment) || moment < 1 || moment > 20)
    )
      return toast("Kies moment 1 tot 20", 1);
    const o = { time: r.t, moment, dow: r.hdow === "" ? null : Number(r.hdow) };
    if (!FM.v.hrem.some((x) => JSON.stringify(x) === JSON.stringify(o)))
      FM.v.hrem.push(o);
    sheet(1);
  },
  hd(d) {
    FM.v.hrem.splice(+d.i, 1);
    sheet(1);
  },
  rl() {
    location.reload();
  },
  fe(d) {
    FM?.x[+d.i]?.fn();
  },
  async fs() {
    if (!FM || FM.busy) return;
    const current = FM;
    current.busy = true;
    try {
      await current.save(current.v);
    } finally {
      current.busy = false;
    }
  },
  nn() {
    noteForm();
  },
  en(d) {
    noteForm(find(S.notes, d.i));
  },
  nf(d) {
    NF.kind = d.k;
    NF.status = d.s;
    render();
  },
  nu() {
    NF.link = null;
    render();
  },
  ma(d) {
    PD = Math.sign(+d.i);
    IM = mshift(IM, +d.i);
    render();
  },
  is(d) {
    ISD = d.i;
    IM = d.i.slice(0, 7);
    render();
  },
  ir(d) {
    IR = +d.i;
    render();
  },
  id() {
    vd = ISD;
    R = "vandaag";
    T = "routine";
    render();
    scrollTo(0, 0);
  },
  mn(d) {
    const f = menu.o[+d.i][1];
    shut();
    f();
  },
  mx() {
    shut();
  },
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (b && ACT[b.dataset.a]) ACT[b.dataset.a](b.dataset, b);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "icon-search" && FM) {
    FM.iconQuery = t.value;
    $o("icon-grid").innerHTML = iconGrid(FM.v.p);
    return;
  }
  if (t.id === "nq") {
    NF.q = t.value;
    document.getElementById("nlist").innerHTML = noteRows();
    return;
  }
  if (!FM || !t.dataset.k || t.dataset.c) return;
  FM.dirty = 1;
  if (t.dataset.j !== undefined) {
    FM.v[t.dataset.k] ||= {};
    FM.v[t.dataset.k][t.dataset.j] = t.value;
  } else if (t.dataset.k === "p.cat" && t.value === "__new") {
    const n = prompt("Naam van de categorie");
    if (n && n.trim()) {
      const c = { id: uid(), n: n.trim() };
      S.cats.push(c);
      FM.v.p.cat = c.id;
      save();
    }
    sheet();
  } else {
    setPath(t.dataset.k, t.value);
    if (t.dataset.re) sheet();
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.id === "icon-category" && FM) {
    FM.iconCategory = t.value;
    $o("icon-grid").innerHTML = iconGrid(FM.v.p);
    return;
  }
  if (t.dataset.c && FM) {
    setPath(t.dataset.k, t.value);
    FM.pop = 1;
    sheet(1);
  }
  if (t.dataset.ph && t.files[0] && FM) {
    try {
      const current = FM,
        id = uid(),
        photo = await small(t.files[0]);
      if (FM !== current) return;
      P[id] = photo;
      FM.v.p.photo = id;
      FM.pop = 1;
      sheet(1);
    } catch {
      toast("Foto kon niet worden gelezen", 1);
    }
  }
  if (t.id === "task-category") {
    TF.list = t.value;
    render();
  }
  if (t.id === "ndate" && Core.validDate(t.value)) {
    ND = t.value;
    render();
  }
  if (t.id === "rdate" && Core.validDate(t.value)) {
    vd = t.value;
    render();
  }
  if (t.id === "gd" && t.value) {
    ad = t.value;
    render();
  }
  if (t.id === "imf" && t.files[0]) {
    await imp(t.files[0]);
    t.value = "";
  }
});
function chk() {
  const t = today();
  if (t !== last) {
    if (vd === last) vd = t;
    if (ad === last) ad = t;
    if (ND === last) ND = t;
    last = t;
    if (!FM) render();
  }
}
document.addEventListener("visibilitychange", () => !document.hidden && chk());
addEventListener("focus", chk);
addEventListener("pageshow", chk);
setInterval(chk, 60000);
addEventListener("online", () => toast("Weer online"));
addEventListener("offline", () => toast("Offline: de app blijft werken"));

/* deel 2: notities */
const ST = { open: "Open", bezig: "Bezig", af: "Afgerond" },
  NT = [
    ["", "Geen koppeling"],
    ["h", "Gewoonte"],
    ["g", "Weekdoel"],
    ["e", "Afspraak"],
    ["i", "Taak"],
    ["d", "Datum"],
  ];
const mshift = (ym, n) => {
  const d = new Date(ym + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const targets = (t) =>
  t === "h"
    ? S.habits.map((x) => [x.id, x.n])
    : t === "g"
      ? S.goals.map((x) => [x.id, x.n])
      : t === "e"
        ? S.events.map((x) => [x.id, x.t + (x.rec ? " (reeks)" : " · " + x.d)])
        : t === "i"
          ? S.lists.flatMap((l) => l.items.map((i) => [i.id, l.n + ": " + i.t]))
          : [];
const tname = (l) => {
  if (!l) return "";
  if (l.t === "d") return fmt(l.id, { day: "numeric", month: "long" });
  const x = targets(l.t).find((a) => a[0] === l.id);
  return x ? x[1] : "";
};
const unlink = (t, id) =>
  S.notes.forEach((n) => {
    if (n.link && n.link.t === t && n.link.id === id) n.link = null;
  });
const nCount = (t, id) =>
  S.notes.filter((n) => n.link && n.link.t === t && n.link.id === id).length;
const noteX = (t, id) => [
  {
    l: `Opmerkingen bekijken (${nCount(t, id)})`,
    fn: () => {
      closeForm();
      NF = { q: "", kind: "", status: "", link: { t, id } };
      T = "notities";
      render();
    },
  },
  {
    l: "Opmerking toevoegen",
    fn: () => {
      closeForm();
      noteForm(null, { lt: t, lid: id });
    },
  },
];
function noteRows() {
  const q = NF.q.toLowerCase(),
    a = S.notes
      .filter(
        (n) =>
          (NF.link ||
            (NV === "dag"
              ? n.scope === "dag" && n.date === ND
              : n.scope === "algemeen")) &&
          (!NF.kind || n.kind === NF.kind) &&
          (!NF.status || n.status === NF.status) &&
          (!NF.link ||
            (n.link && n.link.t === NF.link.t && n.link.id === NF.link.id)) &&
          (!q ||
            [n.title, n.text, n.wat, n.ver, n.act, tname(n.link)]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      )
      .sort((x, y) => (x.u < y.u ? 1 : -1));
  return a.length
    ? a
        .map((n) =>
          row({
            id: n.id,
            ed: "en",
            title: n.title || (n.text || n.wat || n.ver || "").slice(0, 60),
            sub: [
              n.kind === "verbeter" ? "Verbeterpunt" : "Notitie",
              tname(n.link),
              "gewijzigd " +
                fmt(ymd(new Date(n.u)), { day: "numeric", month: "short" }),
            ]
              .filter(Boolean)
              .join(" · "),
            p: {},
            right:
              n.kind === "verbeter"
                ? `<span class="p">${ST[n.status]}</span>`
                : "",
          }),
        )
        .join("")
    : '<div class="cd s">Geen notities gevonden.</div>';
}
function rNotes() {
  let h = hd(
    NV === "dag"
      ? fmt(ND, { weekday: "long", day: "numeric", month: "long" })
      : "Ideeën en verbeterpunten",
    NV === "dag" ? Core.dateTitle(ND) : "Notities",
    NV === "dag"
      ? nb('ndm" data-i="-1', "Vorige notitiedag", "‹") +
          nb('ndm" data-i="1', "Volgende notitiedag", "›")
      : "",
  );
  h += `<div class="sg"><button data-a="nv" data-i="dag" class="${NV === "dag" ? "a" : ""}">Dagelijks</button><button data-a="nv" data-i="algemeen" class="${NV === "algemeen" ? "a" : ""}">Algemeen</button></div>`;
  if (NV === "dag")
    h += `<div class="date-nav"><label class="f" for="ndate">Notitiedatum<input type="date" id="ndate" value="${ND}"></label><button class="gear" data-a="ndt">Vandaag</button></div>`;
  h += `<div class="f"><label for="nq">Zoeken</label><input id="nq" type="search" value="${esc(NF.q)}"></div><div class="row sc">${[
    ["", "", "Alles"],
    ["notitie", "", "Notities"],
    ["verbeter", "", "Verbeterpunten"],
    ["", "open", "Open"],
    ["", "bezig", "Bezig"],
    ["", "af", "Afgerond"],
  ]
    .map(
      ([k, s, l]) =>
        `<button class="ch ${NF.kind === k && NF.status === s ? "a" : ""}" data-a="nf" data-k="${k}" data-s="${s}">${l}</button>`,
    )
    .join(
      "",
    )}${NF.link ? `<button class="ch a" data-a="nu">Gekoppeld: ${esc(tname(NF.link))} ✕</button>` : ""}</div>`;
  return h + `<div id="nlist">${noteRows()}</div>`;
}
function noteForm(n, pre) {
  const L = n?.link || {},
    V = (k) => (v) => v.kind === "verbeter";
  form({
    title: n ? "Bewerken" : "Nieuwe notitie",
    v: {
      scope: n?.scope || NV,
      date: n?.date || ND,
      kind: n?.kind || "notitie",
      title: n?.title || "",
      text: n?.text || "",
      wat: n?.wat || "",
      ver: n?.ver || "",
      act: n?.act || "",
      status: n?.status || "open",
      lt: pre?.lt ?? L.t ?? "",
      lid: pre?.lid ?? (L.t && L.t !== "d" ? L.id : ""),
      ld: L.t === "d" ? L.id : today(),
    },
    f: [
      {
        k: "scope",
        l: "Bewaren bij",
        t: "sel",
        re: 1,
        o: [
          ["dag", "Dagelijkse notities"],
          ["algemeen", "Algemeen"],
        ],
      },
      { k: "date", l: "Notitiedatum", t: "date", if: (v) => v.scope === "dag" },
      {
        k: "kind",
        l: "Soort",
        t: "sel",
        re: 1,
        o: [
          ["notitie", "Notitie"],
          ["verbeter", "Verbeterpunt"],
        ],
      },
      { k: "title", l: "Titel (optioneel)", t: "text" },
      { k: "text", l: "Tekst", t: "area" },
      {
        k: "wat",
        l: "Wat gaat er nog niet goed of kan beter?",
        t: "area",
        if: V(),
      },
      { k: "ver", l: "Wat wil ik concreet veranderen?", t: "area", if: V() },
      { k: "act", l: "Volgende actie (optioneel)", t: "text", if: V() },
      {
        k: "status",
        l: "Status",
        t: "sel",
        o: [
          ["open", "Open"],
          ["bezig", "Bezig"],
          ["af", "Afgerond"],
        ],
        if: V(),
      },
      { k: "lt", l: "Koppelen aan", t: "sel", re: 1, o: NT },
      {
        k: "lid",
        l: "Welk item?",
        t: "sel",
        o: (v) => [["", "Kies…"], ...targets(v.lt)],
        if: (v) => ["h", "g", "e", "i"].includes(v.lt),
      },
      { k: "ld", l: "Datum", t: "date", if: (v) => v.lt === "d" },
    ],
    x: n
      ? [
          {
            l: "Maak er een taak van",
            fn: () =>
              S.lists.length
                ? menu(
                    "Toevoegen aan Taken",
                    S.lists.map((l) => [
                      l.n,
                      () => {
                        l.items.push({
                          id: uid(),
                          t: (
                            n.title ||
                            n.act ||
                            n.ver ||
                            n.text ||
                            "Item"
                          ).slice(0, 80),
                          note: "",
                          done: false,
                          eid: null,
                          p: {},
                        });
                        shut();
                        commit();
                        toast("Taak gemaakt (notitie blijft bestaan)");
                      },
                    ]),
                  )
                : toast("Maak eerst een taakcategorie", 1),
          },
          {
            l: "Verwijderen",
            c: "del",
            fn: () => {
              if (!confirm("Deze notitie verwijderen?")) return;
              S.notes = S.notes.filter((x) => x !== n);
              closeForm();
              commit();
            },
          },
        ]
      : [],
    save: (v) => {
      if (
        !(
          v.title +
          v.text +
          (v.kind === "verbeter" ? v.wat + v.ver + v.act : "")
        ).trim()
      )
        return toast("Schrijf iets op", 1);
      if (v.scope === "dag" && !Core.validDate(v.date))
        return toast("Kies een geldige notitiedatum", 1);
      const link =
          v.lt === "d" && v.ld
            ? { t: "d", id: v.ld }
            : ["h", "g", "e", "i"].includes(v.lt) &&
                targets(v.lt).some((a) => a[0] === v.lid)
              ? { t: v.lt, id: v.lid }
              : null,
        now = new Date().toISOString(),
        o = {
          scope: v.scope,
          date: v.scope === "dag" ? v.date : "",
          kind: v.kind,
          title: v.title.trim(),
          text: v.text,
          wat: v.kind === "verbeter" ? v.wat : "",
          ver: v.kind === "verbeter" ? v.ver : "",
          act: v.kind === "verbeter" ? v.act : "",
          status: v.kind === "verbeter" ? v.status : "open",
          link,
          u: now,
        };
      if (n) Object.assign(n, o);
      else S.notes.push({ id: uid(), c: now, ...o });
      closeForm();
      commit();
    },
  });
}
/* deel 2: kalender en inzicht */
function cal(ym, fn, sel) {
  const f = ym + "-01",
    st = add(f, -dow(f)),
    t = today();
  let h =
    '<div class="cal">' +
    DN.map((n) => `<span class="m" style="text-align:center">${n}</span>`).join(
      "",
    );
  for (let i = 0; i < 42; i++) {
    const d = add(st, i);
    if (i >= 35 && d.slice(0, 7) !== ym) break;
    const c = fn(d);
    h += `<button class="cl ${d === sel ? "a" : ""} ${d.slice(0, 7) === ym ? "" : "o"} ${d === t ? "t" : ""} ${c.s || ""}" data-a="${c.a}" data-i="${d}" aria-label="${fmt(d, { weekday: "long", day: "numeric", month: "long" })}${c.l ? ", " + c.l : ""}"><b>${+d.slice(8)}</b><small>${c.t || ""}</small></button>`;
  }
  return h + "</div>";
}
const avs = () =>
  `<div class="sg"><button class="${AV === "dag" ? "a" : ""}" data-a="av" data-i="dag">Dag</button><button class="${AV === "week" ? "a" : ""}" data-a="av" data-i="week">Week</button><button class="${AV === "maand" ? "a" : ""}" data-a="av" data-i="maand">Maand</button></div>`;
const mdHTML = () => {
  const o = occ(ad);
  return (
    `<div class="t sel">${fmt(ad, { weekday: "long", day: "numeric", month: "long" })}</div>` +
    (o.length
      ? o
          .map((x) =>
            row({
              id: x.e.id,
              x: ad,
              a: "ek",
              ed: "ee",
              ck: !!S.edone[x.e.id + "|" + ad],
              title: x.e.t,
              sub: [
                x.e.allday
                  ? "Hele dag"
                  : [x.s, x.end].filter(Boolean).join("–"),
                Core.durationLabel(x.e.duration),
                x.e.loc,
              ]
                .filter(Boolean)
                .join(" · "),
              p: x.e.p,
            }),
          )
          .join("")
      : '<div class="cd s">Niets gepland</div>')
  );
};
function rMonth() {
  const ym = ad.slice(0, 7);
  let h =
    hd(
      fmt(ym + "-01", { month: "long", year: "numeric" }),
      "Agenda",
      nb('aw" data-i="-1', "Vorige maand", "‹") +
        nb('aw" data-i="1', "Volgende maand", "›") +
        `<button class="gear" data-a="at">Vandaag</button>`,
    ) +
    avs() +
    fbar(S.events);
  h += cal(
    ym,
    (d) => {
      const n = occ(d).length;
      return {
        a: "sd",
        t: n ? "● ".repeat(Math.min(n, 3)).trim() : "",
        l: n ? n + " afspraken" : "",
      };
    },
    ad,
  );
  return h + `<div id="md">${mdHTML()}</div>`;
}
const dstat = (d) => {
  const m = moments(d, 1);
  return m.length
    ? { t: m.length, n: m.filter((x) => S.done[x.k]).length }
    : null;
};
const hstreak = (h) => Core.streak(h, S.done);
const wres = (g, w) => {
  const tg = ver(g, add(w, 6))?.target || 1,
    tot = wsum(g, w);
  return { tot, tg, met: tot >= tg, v: Math.min(1, tot / tg) };
};
function gstreak(g) {
  const w0 = mon(today());
  let run = 0,
    best = 0;
  for (let w = mon(g.start); w <= w0; w = add(w, 7)) {
    if (!gact(g, w)) continue;
    if (wres(g, w).met) {
      run++;
      best = Math.max(best, run);
    } else if (w < w0) run = 0;
  }
  return { cur: run, best };
}
function bars(vals, H, lab) {
  const n = vals.length,
    bw = 340 / n;
  return (
    `<svg viewBox="0 0 340 ${H}" width="100%" role="img" aria-label="${esc(lab)}">` +
    vals
      .map((v, i) =>
        v == null
          ? `<rect x="${i * bw + 1}" y="${H - 2}" width="${Math.max(bw - 2, 1)}" height="2" fill="#3a3a40"/>`
          : `<rect x="${i * bw + 1}" y="${H - Math.max(v * H, 2)}" width="${Math.max(bw - 2, 1)}" height="${Math.max(v * H, 2)}" rx="2" fill="#8e2440"/>`,
      )
      .join("") +
    "</svg>"
  );
}
function rInzicht() {
  const t = today(),
    days = [...Array(IR)].map((_, i) => add(t, i - IR + 1)),
    st = days.map(dstat),
    ok = st.filter(Boolean),
    tot = ok.reduce((a, x) => a + x.t, 0),
    dn = ok.reduce((a, x) => a + x.n, 0),
    full = ok.filter((x) => x.n === x.t).length;
  let h =
    hd("Uit je echte registraties", "Inzicht") +
    `<div class="sg"><button class="${IR === 7 ? "a" : ""}" data-a="ir" data-i="7">7 dagen</button><button class="${IR === 30 ? "a" : ""}" data-a="ir" data-i="30">30 dagen</button></div>`;
  const lab = ok.length
    ? `${Math.round((dn / tot) * 100)}% van ${tot} momenten, ${full} van ${ok.length} dagen volledig`
    : "Geen gewoontemomenten gepland";
  h += `<div class="cd"><div style="display:flex;justify-content:space-between"><span>Dagelijkse voortgang</span><span class="p">${ok.length ? Math.round((dn / tot) * 100) + "%" : "n.v.t."}</span></div><div class="m" style="margin:4px 0 8px">${lab}</div>${bars(
    st.map((x) => (x ? x.n / x.t : null)),
    90,
    "Dagelijkse voltooiing, " + lab,
  )}<div class="m" style="display:flex;justify-content:space-between"><span>${fmt(days[0], { day: "numeric", month: "short" })}</span><span>${fmt(t, { day: "numeric", month: "short" })}</span></div><div class="m" style="margin-top:8px">Elk uitvoermoment telt mee (tandenpoetsen 2, bidden 5). Een dag is pas volledig als alle momenten zijn afgevinkt. Dagen zonder gepland moment tellen niet mee.</div></div>`;
  const hs = S.habits;
  h +=
    `<div class="t">Streaks per gewoonte</div>` +
    (hs.length
      ? hs
          .map((x) => {
            const s = hstreak(x);
            return `<div class="cd" style="display:flex;justify-content:space-between;gap:8px"><span>${esc(x.n)}</span><span class="m">nu ${s.cur} · langste ${s.best} dagen</span></div>`;
          })
          .join("")
      : '<div class="cd s">Nog geen gewoontes.</div>');
  h +=
    `<div class="t">Weekdoelen (laatste 8 weken)</div>` +
    (S.goals.length
      ? S.goals
          .map((g) => {
            const ws = [...Array(8)].map((_, i) => add(mon(t), -7 * (7 - i))),
              rs = ws.map((w) => (gact(g, w) ? wres(g, w) : null)),
              s = gstreak(g),
              c = rs[7],
              u = " " + Core.goalUnit(g, add(mon(t), 6));
            return `<div class="cd"><div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(g.n)}</span><span class="m">nu ${s.cur} · langste ${s.best} weken</span></div><div class="m">Deze week: ${c ? `${Math.round(c.tot * 10) / 10} van ${c.tg}${u}` : "n.v.t."}</div>${bars(
              rs.map((r) => (r ? r.v : null)),
              60,
              `${g.n}: ` +
                rs
                  .map((r) => (r ? Math.round(r.v * 100) + "%" : "n.v.t."))
                  .join(", "),
            )}</div>`;
          })
          .join("")
      : '<div class="cd s">Nog geen weekdoelen.</div>');
  h +=
    `<div class="t">Kalender</div><div class="hb" style="justify-content:space-between;align-items:center;margin-bottom:6px"><button class="gear" data-a="ma" data-i="-1" aria-label="Vorige maand">‹</button><span>${fmt(IM + "-01", { month: "long", year: "numeric" })}</span><button class="gear" data-a="ma" data-i="1" aria-label="Volgende maand">›</button></div>` +
    cal(
      IM,
      (d) => {
        const x = d <= t ? dstat(d) : null;
        return x
          ? {
              a: "is",
              t: Math.round((x.n / x.t) * 100) + "%",
              s: x.n === x.t ? "l2" : x.n ? "l1" : "",
              l: `${x.n} van ${x.t} momenten`,
            }
          : { a: "is", t: "", l: "geen momenten" };
      },
      ISD,
    );
  const ms = moments(ISD, 1),
    nn = S.notes.filter(
      (n) =>
        (n.scope === "dag" && n.date === ISD) ||
        (n.link && n.link.t === "d" && n.link.id === ISD),
    );
  h +=
    `<div class="t sel">${fmt(ISD, { weekday: "long", day: "numeric", month: "long" })}</div>` +
    (ms.length
      ? ms
          .map(
            (m) =>
              `<div class="cd s">${S.done[m.k] ? "✓ Gedaan" : "○ Niet gedaan"} · ${esc(m.h.n)}${m.lab ? " · " + esc(m.lab.toLowerCase()) : m.c > 1 ? ` · ${m.i}/${m.c}` : ""}</div>`,
          )
          .join("") +
        `<button class="btn" data-a="id">Deze dag bekijken en corrigeren</button>`
      : '<div class="cd s">Niet van toepassing: geen momenten gepland.</div>') +
    nn
      .map(
        (n) =>
          `<div class="cd s">Notitie: ${esc(n.title || n.text || n.wat)}</div>`,
      )
      .join("");
  return h;
}
function prog() {
  const t = $o("pgt");
  if (!t) return;
  const all = moments(vd, 1),
    dn = all.filter((m) => S.done[m.k]).length,
    pc = all.length ? dn / all.length : 0;
  t.textContent = `${dn} van ${all.length} momenten`;
  const p = $o("pgp"),
    b = $o("pgb");
  if (p) p.textContent = Math.round(pc * 100) + "%";
  if (b) b.style.width = pc * 100 + "%";
}
/* deel 3: herinneringen en meldingen */
const b64 = (b) =>
    btoa(String.fromCharCode(...new Uint8Array(b)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  unb64 = (x) =>
    Uint8Array.from(
      atob(
        x.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (x.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
const loc2utc = Core.localToUTC;
const DNL = [
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
  "zondag",
];
const minTxt = (m) =>
    m % 1440 === 0
      ? `${m / 1440} dag${m > 1440 ? "en" : ""}`
      : m % 60 === 0
        ? `${m / 60} uur`
        : `${m} minuten`,
  minLbl = (m) =>
    m === 0
      ? "Nu"
      : m === 1440
        ? "Morgen"
        : m % 1440 === 0
          ? `Over ${m / 1440} dagen`
          : m % 60 === 0
            ? `Over ${m / 60} uur`
            : `Over ${m} minuten`;
function remUI(v) {
  const r = (v._r = v._r || {});
  r.min = r.min ?? "60";
  r.cu = r.cu ?? "";
  r.sc = r.sc || "all";
  r.dow = r.dow ?? "0";
  r.date = r.date || v.d || today();
  const lab = (x) =>
    (x.min === 0 ? "Op het moment zelf" : minTxt(x.min) + " van tevoren") +
    (x.dow != null ? " · alleen op " + DNL[x.dow] : "") +
    (x.date
      ? " · alleen op " + fmt(x.date, { day: "numeric", month: "short" })
      : "");
  const o = (a, b, c) =>
    `<option value="${a}" ${String(c) === String(a) ? "selected" : ""}>${b}</option>`;
  return `<div id="rl">${(v.rem || []).map((x, i) => `<div class="r"><div class="x">${esc(lab(x))}</div><button type="button" class="mo" data-a="rd" data-i="${i}" aria-label="Herinnering verwijderen">✕</button></div>`).join("") || '<div class="m" style="margin-bottom:8px">Nog geen herinneringen</div>'}</div>
 <div class="row"><select data-k="_r.min" data-re="1" aria-label="Hoeveel van tevoren">${[
   [0, "Op het moment zelf"],
   [5, "5 minuten van tevoren"],
   [15, "15 minuten van tevoren"],
   [30, "30 minuten van tevoren"],
   [60, "1 uur van tevoren"],
   [120, "2 uur van tevoren"],
   [1440, "1 dag van tevoren"],
   [2880, "2 dagen van tevoren"],
   ["x", "Eigen aantal minuten…"],
 ]
   .map(([a, b]) => o(a, b, r.min))
   .join("")}</select>
 ${r.min === "x" ? `<input type="number" inputmode="numeric" min="0" data-k="_r.cu" value="${esc(r.cu)}" placeholder="Minuten" aria-label="Aantal minuten van tevoren">` : ""}
 <select data-k="_r.sc" data-re="1" aria-label="Wanneer geldt dit">${o("all", "Bij elke keer", r.sc)}${o("dow", "Alleen op een weekdag", r.sc)}${o("date", "Alleen op een datum", r.sc)}</select>
 ${r.sc === "dow" ? `<select data-k="_r.dow" aria-label="Weekdag">${DNL.map((n, i) => o(i, n, r.dow)).join("")}</select>` : ""}${r.sc === "date" ? `<input type="date" data-k="_r.date" value="${esc(r.date)}" aria-label="Datum">` : ""}</div>
 <button type="button" class="btn" data-a="ra">Herinnering toevoegen</button>`;
}
function hremUI(v) {
  const r = (v._r = v._r || {});
  r.t = r.t || "08:00";
  r.moment = r.moment || "";
  r.hdow = r.hdow ?? "";
  return `${
    (v.hrem || [])
      .map((x, i) => {
        const o = typeof x === "string" ? { time: x } : x;
        return `<div class="r"><div class="x">${esc(o.time)}${o.moment ? " · moment " + o.moment : ""}${o.dow != null ? " · " + DN[o.dow] : ""}</div><button type="button" class="mo" data-a="hd" data-i="${i}" aria-label="Herinnering verwijderen">✕</button></div>`;
      })
      .join("") || '<div class="m">Nog geen herinneringen.</div>'
  }<div class="f"><label>Tijdstip<input type="time" data-k="_r.t" value="${esc(r.t)}" aria-label="Tijdstip"></label></div><div class="f"><label>Uitvoermoment (optioneel)<input type="number" min="1" max="20" data-k="_r.moment" value="${esc(r.moment)}" aria-label="Nummer van uitvoermoment"></label></div><div class="f"><label>Weekdag<select data-k="_r.hdow"><option value="">Alle geplande dagen</option>${DN.map((n, i) => `<option value="${i}" ${String(r.hdow) === String(i) ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><button type="button" class="btn" data-a="ha">Tijd toevoegen</button>`;
}
function directRemUI(v) {
  const r = (v._direct = v._direct || { d: today(), time: "09:00" });
  return (
    (v.reminders || [])
      .map(
        (x, i) =>
          `<div class="r"><div class="x">${esc(x.d)} · ${esc(x.time)}</div><button type="button" class="mo" data-a="direct-del" data-i="${i}" aria-label="Herinnering verwijderen">✕</button></div>`,
      )
      .join("") +
    `<div class="tg"><label>Datum<input type="date" data-k="_direct.d" value="${esc(r.d)}"></label><label>Tijd<input type="time" data-k="_direct.time" value="${esc(r.time)}"></label></div><button type="button" class="btn" data-a="direct-add">Herinnering toevoegen</button>`
  );
}
function reminderManager() {
  menu("Losse herinneringen", [
    ...S.reminders.map((r) => [
      r.title + " · " + r.d + " " + r.time,
      () => {
        shut();
        reminderForm(r);
      },
    ]),
    [
      "+ Herinnering toevoegen",
      () => {
        shut();
        reminderForm();
      },
    ],
  ]);
}
function reminderForm(r) {
  form({
    title: r ? "Herinnering bewerken" : "Losse herinnering",
    v: {
      title: r?.title || "",
      d: r?.d || today(),
      time: r?.time || "09:00",
      p: r?.p,
    },
    f: [
      { k: "title", l: "Titel", t: "text" },
      { k: "d", l: "Datum", t: "date" },
      { k: "time", l: "Tijd", t: "time" },
      { k: "p", t: "look" },
    ],
    x: r
      ? [
          {
            l: "Herinnering verwijderen",
            c: "del",
            fn: () => {
              S.reminders = S.reminders.filter((x) => x !== r);
              closeForm();
              commit(1);
            },
          },
        ]
      : [],
    save: (v) => {
      if (!v.title.trim() || !Core.validDate(v.d) || !Core.validTime(v.time))
        return toast("Vul titel, datum en tijd in", 1);
      const o = { title: v.title.trim(), d: v.d, time: v.time, p: v.p };
      if (r) Object.assign(r, o);
      else S.reminders.push({ id: uid(), ...o });
      closeForm();
      commit(1);
    },
  });
}
function remList() {
  return Core.reminders(S, Date.now());
}
const normUrl = (u) => {
  u = (u || "").trim().toLowerCase().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+$/.test(u) || /^http:\/\/localhost(:\d+)?$/.test(u)
    ? u
    : null;
};
async function refreshNS() {
  NS.perm = "Notification" in window ? Notification.permission : "";
  NS.cfg = !!(SV && SV.url && SV.token);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    NS.sub = !!(reg && (await reg.pushManager.getSubscription()));
  } catch {
    NS.sub = false;
  }
  if (FM && FM.title === "Meldingen") {
    const info = $o("notif-state");
    if (info) info.outerHTML = notifInfo();
  }
}
let syncRunning = false,
  remRevision = 0;
function schedSync() {
  if (!SV?.url || !SV?.token || SV.enabled === false) return;
  remRevision++;
  SV.dirty = true;
  kvSet("srv", SV).catch(() => {});
  refreshNS();
  clearTimeout(SY);
  SY = setTimeout(() => sync(), 1000);
}
async function api(path, body) {
  const r = await fetch(SV.url + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + SV.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "De toegangscode klopt niet"
        : j.error || "Server antwoordde met " + r.status,
    );
  return j;
}
async function sync(manual) {
  if (!SV?.url || !SV?.token) {
    if (manual) toast("Vul eerst adres en code in", 1);
    return false;
  }
  if (syncRunning) {
    if (manual) toast("Synchronisatie is bezig");
    return false;
  }
  syncRunning = true;
  const revision = remRevision;
  try {
    if (SV.pendingUnsubscribe) {
      await api("/unsubscribe", { deviceId: SV.deviceId });
      SV.pendingUnsubscribe = false;
      SV.dirty = false;
      await kvSet("srv", SV);
      return true;
    }
    if (SV.enabled === false) return false;
    const reg = await navigator.serviceWorker.getRegistration(),
      sub = await reg?.pushManager.getSubscription();
    if (!sub) throw new Error("Meldingen staan nog niet aan op dit toestel");
    SV.deviceId ||= uid();
    const rem = remList();
    if (rem.length > 3000)
      throw new Error(
        "Meer dan 3000 herinneringen in 35 dagen. Verminder het aantal.",
      );
    await api("/sync", {
      deviceId: SV.deviceId,
      subscription: sub.toJSON(),
      reminders: rem,
    });
    NS.last = Date.now();
    NS.n = rem.length;
    NS.err = "";
    SV.dirty = revision !== remRevision;
    SV.last = NS.last;
    if (manual) toast(`Gesynchroniseerd: ${rem.length} herinneringen`);
    return true;
  } catch (e) {
    NS.err = e.message;
    SV.dirty = true;
    if (manual) toast("Synchroniseren mislukt: " + NS.err, 1);
    return false;
  } finally {
    syncRunning = false;
    await kvSet("srv", SV).catch(() => {});
    refreshNS();
    if (revision !== remRevision) {
      clearTimeout(SY);
      SY = setTimeout(() => sync(), 1000);
    }
  }
}
async function enable() {
  const url = normUrl(FM.v.url),
    token = (FM.v.token || "").trim();
  if (!url || token.length < 32)
    return toast(
      "Vul een https-adres en een toegangscode van minstens 32 tekens in",
      1,
    );
  if (!(
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  ))
    return toast("Webmeldingen worden hier niet ondersteund", 1);
  if (IOS && !STD)
    return toast(
      "Open Dagritme vanaf je beginscherm om meldingen aan te zetten",
      1,
    );
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    refreshNS();
    return toast("Toestemming niet gegeven", 1);
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg)
      throw new Error("Offline installatie nog niet gereed. Herlaad de app.");
    // An old server must be disconnected first, otherwise it could continue sending.
    if (SV?.url && SV.url !== url && SV.enabled !== false)
      throw new Error("Zet eerst meldingen uit voor je van server wisselt.");
    SV = {
      ...SV,
      url,
      token,
      deviceId: SV?.deviceId || uid(),
      enabled: true,
      pendingUnsubscribe: false,
      dirty: true,
    };
    await kvSet("srv", SV);
    const r = await fetch(url + "/key");
    if (!r.ok) throw new Error("Server niet bereikbaar (" + r.status + ")");
    const { publicKey } = await r.json();
    let sub = await reg.pushManager.getSubscription();
    if (
      sub &&
      !(
        sub.options?.applicationServerKey &&
        b64(sub.options.applicationServerKey) === publicKey
      )
    ) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub)
      await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: unb64(publicKey),
      });
    if (await sync(true)) toast("Meldingen staan aan en zijn gesynchroniseerd");
  } catch (e) {
    NS.err = e.message;
    toast("Aanzetten mislukt: " + e.message, 1);
  }
  refreshNS();
}
async function testPush() {
  if (!SV?.url) return toast("Vul eerst adres en code in", 1);
  try {
    if (!(await sync(true))) return;
    await api("/test", { deviceId: SV.deviceId });
    toast("Pushdienst heeft de testmelding aangenomen. Controleer je iPhone.");
  } catch (e) {
    toast("Testmelding mislukt: " + e.message, 1);
  }
}
async function disable() {
  if (!SV) return;
  SV.enabled = false;
  SV.pendingUnsubscribe = true;
  SV.dirty = true;
  clearTimeout(SY);
  remRevision++;
  await kvSet("srv", SV).catch(() => {});
  try {
    const reg = await navigator.serviceWorker.getRegistration(),
      sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    const ok = await sync();
    toast(
      ok
        ? "Meldingen uitgezet en serverplanning verwijderd"
        : "Lokaal uitgezet. Serverannulering wacht op internet.",
      !ok,
    );
  } catch (e) {
    toast("Annuleren wacht op synchronisatie: " + e.message, 1);
  }
  refreshNS();
}

function notifInfo() {
  const k = (x) => (x ? "✓" : "○"),
    L = [];
  if (!(
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  ))
    L.push("Dit toestel of deze browser ondersteunt geen webmeldingen.");
  else {
    if (IOS && !STD)
      L.push(
        "Zet Dagritme eerst op je beginscherm en open de app daar. Op iPhone werken webmeldingen alleen in de geïnstalleerde app (iOS 16.4 of nieuwer).",
      );
    L.push(
      `${k(NS.cfg)} Serveradres en code ingevuld`,
      `${k(NS.perm === "granted")} Toestemming: ${{ granted: "gegeven", denied: "geweigerd (zet aan via iOS Instellingen > Meldingen > Dagritme)", default: "nog niet gevraagd" }[NS.perm] || "onbekend"}`,
      `${k(NS.sub)} Abonnement op dit toestel`,
      `${k(NS.last && !NS.err && !SV?.dirty)} ${SV?.dirty ? "Wijzigingen wachten op synchronisatie. " : ""}Laatste synchronisatie: ${NS.last ? new Date(NS.last).toLocaleString("nl-NL", { timeZone: TZ }) : "nog niet"}${NS.n != null ? " · " + NS.n + " herinneringen gepland" : ""}`,
    );
    if (NS.err) L.push("Fout: " + NS.err);
  }
  return `<div id="notif-state"><div class="cd s" style="color:var(--tx)">${L.map(esc).join("<br>")}</div><div class="m" style="margin:-4px 4px 14px">Alleen titel en tijd van komende herinneringen gaan naar jouw eigen server. Notities, foto’s en statistieken blijven op je toestel. Foto’s en kleuren verschijnen niet in meldingen. De app plant maximaal 35 dagen vooruit; open haar regelmatig om de planning te vernieuwen. Na een offline wijziging klopt de serverplanning pas na synchronisatie.</div></div>`;
}
function notifForm() {
  refreshNS();
  form({
    title: "Meldingen",
    v: { url: SV?.url || "", token: SV?.token || "" },
    f: [
      { k: "info", t: "info", h: notifInfo },
      { k: "url", l: "Adres van je Worker (https://…workers.dev)", t: "text" },
      { k: "token", l: "Toegangscode (jouw API_TOKEN)", t: "pw" },
    ],
    x: [
      { l: "Verbinden en meldingen aanzetten", fn: enable },
      { l: "Testmelding sturen", fn: testPush },
      {
        l: "Serverplanning controleren",
        fn: async () => {
          try {
            const j = await api("/status", { deviceId: SV?.deviceId });
            alert(
              "Serverplanning: " +
                j.counts.map((x) => x.status + ": " + x.count).join(", ") +
                ". pending = gepland; sent = aangenomen door pushdienst; failed = mislukt; expired = verlopen.",
            );
          } catch (e) {
            toast(e.message, 1);
          }
        },
      },
      { l: "Nu synchroniseren", fn: () => sync(1) },
      { l: "Meldingen uitzetten", c: "del", fn: disable },
    ],
    save: async (v) => {
      if (!normUrl(v.url) || v.token.trim().length < 32)
        return toast(
          "Vul een geldig serveradres en een code van minstens 32 tekens in",
          1,
        );
      if (SV?.url && SV.url !== normUrl(v.url) && SV.enabled !== false)
        return toast("Zet eerst de huidige meldingen uit", 1);
      SV = {
        ...SV,
        url: normUrl(v.url),
        token: (v.token || "").trim(),
      };
      await kvSet("srv", SV);
      closeForm();
      toast("Opgeslagen");
      refreshNS();
    },
  });
}
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && SV && SV.url) sync();
});
addEventListener("online", () => {
  if (SV && SV.dirty) sync();
});
/* Only the handle captures touch: checking and scrolling elsewhere stay native. */
let drag = null;
function dragStop(commitMove = false) {
  if (!drag) return;
  const d = drag;
  drag = null;
  clearTimeout(d.timer);
  cancelAnimationFrame(d.frame);
  d.ghost?.remove();
  d.marker?.remove();
  d.row.classList.remove("drag-source");
  document.body.classList.remove("dragging");
  try {
    d.handle.releasePointerCapture(d.pointer);
  } catch {}
  if (!commitMove || !d.active || !d.targetPart) return;
  moveHabit(d.id, d.moment, d.targetPart, d.before);
}
function moveHabit(id, moment, part, before) {
  const h = find(S.habits, id);
  if (!h) return;
  const from = today(),
    v = ver(h, from) || h.hist.at(-1);
  const previous =
    v.momentParts?.[moment] ||
    PARTS.find(
      (p) => p[0] === (v.labels?.[moment - 1] || "").toLowerCase(),
    )?.[0] ||
    v.part ||
    h.part;
  if (
    previous !== part &&
    (h.time || h.hrem.length) &&
    !confirm(
      "Dagdeel wijzigen? Je ingestelde tijden en herinneringen blijven hetzelfde. Wil je verplaatsen?",
    )
  ) {
    render();
    return;
  }
  if (previous !== part) {
    const snapshot = structuredClone(v);
    snapshot.from = from;
    snapshot.momentParts = { ...snapshot.momentParts, [moment]: part };
    h.hist = h.hist.filter((x) => x.from !== from);
    h.hist.push(snapshot);
    h.hist.sort((a, b) => a.from.localeCompare(b.from));
    if (snapshot.count === 1) {
      h.part = part;
      snapshot.part = part;
    }
  }
  const ordered = S.habits
      .slice()
      .sort((a, b) => a.ord - b.ord)
      .filter((x) => x.id !== id),
    index = before ? ordered.findIndex((x) => x.id === before) : -1;
  ordered.splice(index < 0 ? ordered.length : index, 0, h);
  ordered.forEach((x, i) => (x.ord = i));
  S.set.sort = "handmatig";
  commit();
  toast("Nieuwe volgorde bewaard");
}
document.addEventListener("pointerdown", (e) => {
  const handle = e.target.closest("[data-drag]");
  if (!handle || e.button > 0 || LAY.length) return;
  const row = handle.closest("[data-habit-row]");
  dragStop();
  const d = (drag = {
    id: handle.dataset.drag,
    moment: Number(handle.dataset.moment),
    handle,
    row,
    pointer: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    active: false,
  });
  handle.setPointerCapture(e.pointerId);
  d.timer = setTimeout(() => {
    if (drag !== d) return;
    d.active = true;
    d.ghost = row.cloneNode(true);
    d.ghost.classList.add("drag-ghost");
    d.ghost.setAttribute("aria-hidden", "true");
    d.ghost.style.width = row.getBoundingClientRect().width + "px";
    document.body.appendChild(d.ghost);
    d.marker = document.createElement("div");
    d.marker.className = "drop-marker";
    row.classList.add("drag-source");
    document.body.classList.add("dragging");
    dragFrame();
  }, 320);
});
function dragFrame() {
  const d = drag;
  if (!d?.active) return;
  d.ghost.style.transform = `translate(${d.x - d.ghost.offsetWidth / 2}px,${d.y - 28}px)`;
  const hit = document.elementFromPoint(d.x, d.y),
    group = hit?.closest(".habit-group");
  if (group) {
    d.targetPart = group.dataset.part;
    const rows = [...group.querySelectorAll("[data-habit-row]")].filter(
      (r) => r.dataset.habitRow !== d.id,
    );
    const before = rows.find((r) => {
      const b = r.getBoundingClientRect();
      return d.y < b.top + b.height / 2;
    });
    d.before = before?.dataset.habitRow || null;
    group.insertBefore(d.marker, before || null);
  }
  if (d.y < 90) scrollBy(0, -8);
  else if (d.y > innerHeight - 160) scrollBy(0, 8);
  d.frame = requestAnimationFrame(dragFrame);
}
document.addEventListener(
  "pointermove",
  (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (
      !drag.active &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 12
    )
      dragStop();
    if (drag?.active) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener("pointerup", (e) => {
  if (drag?.pointer === e.pointerId) dragStop(true);
});
document.addEventListener("pointercancel", () => dragStop());
addEventListener("blur", () => dragStop());
if (window.visualViewport) {
  const resize = () => {
    const v = visualViewport;
    document.documentElement.style.setProperty(
      "--viewport-height",
      v.height + "px",
    );
    document.documentElement.style.setProperty(
      "--keyboard-inset",
      Math.max(0, innerHeight - v.height - v.offsetTop) + "px",
    );
    document.body.classList.toggle("keyboard", innerHeight - v.height > 120);
  };
  visualViewport.addEventListener("resize", resize);
  resize();
}

// Boot only after durable storage has been read. Never replace unreadable data with an empty state.
(async () => {
  try {
    db = await open();
    const stored = await kvGet("state");
    S = norm(stored || blank());
    P = (await kvGet("photos")) || {};
    SV = (await kvGet("srv")) || null;
    NS.last = SV?.last || null;
    if (!stored) {
      const legacyGet = (k) =>
        new Promise((resolve, reject) => {
          const q = db.transaction("kv").objectStore("kv").get(k);
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        });
      const old = await legacyGet("state");
      if (old)
        legacyBackup = {
          app: "dagritme",
          v: 1,
          S: old,
          P: (await legacyGet("photos")) || {},
        };
    }
  } catch (e) {
    app.innerHTML = `<div class="em"><h1>Opslag niet beschikbaar</h1><p>${esc(e.message)}. Je gegevens zijn niet overschreven. Sluit andere tabbladen en probeer opnieuw.</p><button class="btn" data-a="rl">Opnieuw proberen</button></div>`;
    return;
  }
  render();
  refreshNS();
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("sw.js", {
        updateViaCache: "none",
      });
      const notice = () => {
        if (reg.waiting && navigator.serviceWorker.controller)
          $o("up").classList.add("show");
      };
      notice();
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed") notice();
        });
      });
      let reloading = false,
        updateAccepted = false;
      const previouslyControlled = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updateAccepted) {
          if (previouslyControlled) $o("up").classList.add("show");
          return;
        }
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      ACT.rl = async () => {
        if (
          FM?.dirty &&
          !confirm(
            "Open formulier sluiten voor de update? Niet-opgeslagen invoer gaat verloren.",
          )
        )
          return;
        await writes;
        if (reg.waiting) {
          updateAccepted = true;
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } else location.reload();
      };
      const upd = () => reg.update().catch(() => {});
      document.addEventListener(
        "visibilitychange",
        () => !document.hidden && upd(),
      );
      setInterval(upd, 36e5);
    } catch (e) {
      toast("Offline installatie niet gelukt. Probeer later opnieuw.", 1);
    }
  }
  if (SV?.url) sync();
})();
