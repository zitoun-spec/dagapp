/** Pure calendar, migration and backup rules shared by the app and tests. */
export const TZ = "Europe/Amsterdam";
export const ALL = [0, 1, 2, 3, 4, 5, 6];
export const SCHEMA = 4;
export const dateObject = (s) => new Date(s + "T12:00:00Z");
export const ymd = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
export const today = () => ymd(new Date());
export function add(s, n) {
  const d = dateObject(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dow = (s) => (dateObject(s).getUTCDay() + 6) % 7;
export const monday = (s) => add(s, -dow(s));
export const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  s >= "1900-01-01" &&
  s <= "2200-12-31" &&
  !isNaN(dateObject(s)) &&
  dateObject(s).toISOString().slice(0, 10) === s;
export const validTime = (s) =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function dateTitle(s, t = today()) {
  return s === t
    ? "Vandaag"
    : s === add(t, -1)
      ? "Gisteren"
      : s === add(t, 1)
        ? "Morgen"
        : new Intl.DateTimeFormat("nl-NL", {
            timeZone: "UTC",
            weekday: "long",
            day: "numeric",
            month: "long",
          })
            .format(dateObject(s))
            .replace(/^./, (c) => c.toUpperCase());
}
export const blank = () => ({
  v: SCHEMA,
  started: false,
  habits: [],
  goals: [],
  logs: [],
  done: {},
  events: [],
  edone: {},
  lists: [],
  cats: [],
  notes: [],
  reminders: [],
  set: { sort: "handmatig", hideDone: false },
});
export function version(item, date) {
  return (
    (item.hist || [])
      .filter((x) => x.from <= date)
      .sort((a, b) => a.from.localeCompare(b.from))
      .at(-1) || null
  );
}
export function schedule(h, d) {
  if (
    d < h.start ||
    (h.end && d > h.end) ||
    (h.ae && d > h.ae) ||
    (h.pz || []).some((p) => d >= p.from && (!p.to || d < p.to))
  )
    return null;
  const v = version(h, d);
  return v?.days.includes(dow(d)) ? v : null;
}
export function streak(h, done, t = today()) {
  let run = 0,
    best = 0;
  for (let d = h.start; d <= t; d = add(d, 1)) {
    const v = schedule(h, d);
    if (!v) continue;
    const complete = Array.from(
      { length: v.count },
      (_, i) => done[`${d}|${h.id}|${i + 1}`],
    ).every(Boolean);
    if (complete) {
      run++;
      best = Math.max(run, best);
    } else if (d < t) run = 0;
  }
  return { cur: run, best };
}
export function migrate(input, t = today()) {
  const s = { ...blank(), ...structuredClone(input) };
  s.set = { sort: "handmatig", hideDone: false, ...s.set };
  for (const [i, h] of s.habits.entries()) {
    h.id ||= crypto.randomUUID();
    h.start ||= t;
    h.st ||= "actief";
    h.ord ??= i;
    h.p ||= {};
    h.part ||= "elk";
    h.time ||= "";
    h.labels ||= [];
    h.hrem ||= [];
    h.pz ||= [];
    h.duration ??= null;
    h.desc ||= "";
    h.end ||= "";
    h.hist ||= [
      { from: h.start, days: h.days || [...ALL], count: h.count || 1 },
    ];
    h.hist.sort((a, b) => a.from.localeCompare(b.from));
    for (const v of h.hist) {
      v.part ??= h.part;
      v.labels ??= [...h.labels];
      v.time ??= h.time;
      v.duration ??= h.duration;
    }
    if (h.st === "pauze" && !h.pz.length) h.pz.push({ from: t, to: "" });
    if (h.st === "archief" && !h.ae) h.ae = t;
    delete h.days;
    delete h.count;
  }
  for (const g of s.goals) {
    g.id ||= crypto.randomUUID();
    g.start ||= t;
    g.st ||= "actief";
    g.p ||= {};
    g.pz ||= [];
    g.hrem ||= [];
    g.type ||= "aantal";
    g.unit ||= "";
    g.hist ||= [
      { from: g.start, target: g.target || 1, type: g.type, unit: g.unit },
    ];
    g.hist.sort((a, b) => a.from.localeCompare(b.from));
    for (const v of g.hist) {
      v.type ||= g.type;
      v.unit ??= g.unit;
    }
    if (g.st === "pauze" && !g.pz.length) g.pz.push({ from: t, to: "" });
    if (g.st === "archief" && !g.ae) g.ae = t;
    delete g.target;
  }
  for (const e of s.events) {
    e.id ||= crypto.randomUUID();
    e.rem ||= [];
    e.ex ||= [];
    e.tm ||= {};
    e.te ||= {};
    e.days ||= [];
    e.p ||= {};
  }
  for (const l of s.lists) {
    l.id ||= crypto.randomUUID();
    l.items ||= [];
    for (const i of l.items) {
      i.id ||= crypto.randomUUID();
      i.p ||= {};
      i.reminders ||= [];
    }
  }
  for (const c of s.cats) c.id ||= crypto.randomUUID();
  for (const n of s.notes) {
    n.id ||= crypto.randomUUID();
    n.kind = n.kind === "verbeter" ? "verbeter" : "notitie";
    n.status ||= "open";
    n.c ||= new Date(t + "T12:00:00Z").toISOString();
    n.u ||= n.c;
    n.link ||= null;
    n.scope ||= n.link?.t === "d" ? "dag" : "algemeen";
    n.date ||= n.scope === "dag" ? n.link?.id || t : "";
  }
  s.v = SCHEMA;
  return s;
}
const safeId = (x) =>
  typeof x === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(x);
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const fail = (msg) => {
  throw new Error(msg);
};
function safeTree(x, depth = 0) {
  if (depth > 30) fail("Bestand is te diep genest");
  if (typeof x === "string" && x.length > 1000000)
    fail("Te groot tekst- of fotoveld");
  if (x && typeof x === "object")
    for (const [k, v] of Object.entries(x)) {
      if (["__proto__", "constructor", "prototype"].includes(k))
        fail("Onveilig veld in bestand");
      safeTree(v, depth + 1);
    }
}
export function validateBackup(j, t = today()) {
  if (!object(j) || j.app !== "dagritme" || !object(j.S))
    fail("Geen geldig Dagritme-back-upbestand");
  if ((j.v ?? 1) > SCHEMA || (j.S.v ?? 1) > SCHEMA)
    fail("Dit bestand is van een nieuwere appversie");
  safeTree(j);
  const s = j.S;
  for (const k of [
    "habits",
    "goals",
    "logs",
    "events",
    "lists",
    "cats",
    "notes",
    "reminders",
  ]) {
    if (s[k] !== undefined && (!Array.isArray(s[k]) || s[k].length > 20000))
      fail("Ongeldige verzameling: " + k);
    const ids = new Set();
    for (const item of s[k] || []) {
      if (!object(item) || !safeId(item.id) || ids.has(item.id))
        fail("Ontbrekend of dubbel ID in " + k);
      ids.add(item.id);
    }
  }
  for (const k of ["done", "edone", "set"])
    if (s[k] !== undefined && !object(s[k])) fail("Ongeldig veld: " + k);
  const checkDate = (d, required = false) => {
    if ((required || d) && !validDate(d)) fail("Ongeldige datum");
  };
  const days = (a) => {
    if (
      !Array.isArray(a) ||
      !a.length ||
      a.some((i) => !Number.isInteger(i) || i < 0 || i > 6) ||
      new Set(a).size !== a.length
    )
      fail("Ongeldige weekdagen");
  };
  const text = (v, required = false) => {
    if (
      (required || v != null) &&
      (typeof v !== "string" || (required && !v.trim()))
    )
      fail("Ongeldige tekst");
  };
  const checkTime = (d) => {
    if (d && !validTime(d)) fail("Ongeldig tijdstip");
  };
  const checkP = (p) => {
    if (p !== undefined && !object(p)) fail("Ongeldige vormgeving");
    if (p?.color && !/^#[a-f\d]{6}$/i.test(p.color)) fail("Ongeldige kleur");
    for (const k of ["photo", "icon", "cat", "side"])
      if (p?.[k] != null) text(p[k]);
    for (const k of ["photo", "cat"])
      if (p?.[k] && !safeId(p[k])) fail("Ongeldige verwijzing");
  };
  for (const h of [...(s.habits || []), ...(s.goals || [])]) {
    text(h.n, true);
    checkDate(h.start, true);
    checkDate(h.end);
    checkDate(h.ae);
    checkP(h.p);
    checkTime(h.time);
    if (
      h.duration != null &&
      (!Number.isFinite(h.duration) || h.duration < 0 || h.duration > 10080)
    )
      fail("Ongeldige duur");
    if (h.hist !== undefined && (!Array.isArray(h.hist) || !h.hist.length))
      fail("Ongeldige historie");
    const isHabit = (s.habits || []).includes(h);
    if (isHabit && !h.hist) {
      if (h.days) days(h.days);
      if (
        h.count != null &&
        (!Number.isInteger(h.count) || h.count < 1 || h.count > 20)
      )
        fail("Ongeldig aantal momenten");
    }
    if (h.st && !["actief", "pauze", "archief"].includes(h.st))
      fail("Ongeldige status");
    if (h.part && !["ochtend", "middag", "avond", "elk"].includes(h.part))
      fail("Ongeldig dagdeel");
    for (const v of h.hist || []) {
      checkDate(v.from, true);
      if (isHabit) {
        days(v.days);
        if (!Number.isInteger(v.count) || v.count < 1 || v.count > 20)
          fail("Ongeldig aantal momenten");
        if (
          v.labels !== undefined &&
          (!Array.isArray(v.labels) ||
            v.labels.some((x) => typeof x !== "string"))
        )
          fail("Ongeldige historische momentnamen");
        if (v.part && !["ochtend", "middag", "avond", "elk"].includes(v.part))
          fail("Ongeldig historisch dagdeel");
        if (
          v.duration != null &&
          (!Number.isFinite(v.duration) || v.duration < 0 || v.duration > 10080)
        )
          fail("Ongeldige historische duur");
        checkTime(v.time);
        if (
          v.momentParts !== undefined &&
          (!object(v.momentParts) ||
            Object.entries(v.momentParts).some(
              ([i, p]) =>
                !/^([1-9]|1\d|20)$/.test(i) ||
                !["ochtend", "middag", "avond", "elk"].includes(p),
            ))
        )
          fail("Ongeldige historische momentindeling");
      } else if (!(v.target > 0) || !Number.isFinite(v.target))
        fail("Ongeldig weekdoel");
    }
    if (h.pz !== undefined && !Array.isArray(h.pz)) fail("Ongeldige pauzes");
    for (const p of h.pz || []) {
      checkDate(p.from, true);
      checkDate(p.to);
    }
    if (
      h.labels !== undefined &&
      (!Array.isArray(h.labels) || h.labels.some((x) => typeof x !== "string"))
    )
      fail("Ongeldige momentnamen");
    if (h.hrem !== undefined && !Array.isArray(h.hrem))
      fail("Ongeldige herinneringen");
    for (const r of h.hrem || []) {
      if (typeof r === "string") {
        if (!validTime(r)) fail("Ongeldig herinneringstijdstip");
      } else if (
        !object(r) ||
        !validTime(r.time) ||
        (r.moment != null &&
          (!Number.isInteger(r.moment) || r.moment < 1 || r.moment > 20)) ||
        (r.dow != null && (!Number.isInteger(r.dow) || r.dow < 0 || r.dow > 6))
      )
        fail("Ongeldige herinnering");
    }
    text(h.desc);
  }
  for (const e of s.events || []) {
    text(e.t, true);
    checkDate(e.d, true);
    checkDate(e.end);
    checkP(e.p);
    checkTime(e.s);
    checkTime(e.e);
    if (e.rec) days(e.days);
    if (e.ex !== undefined && !Array.isArray(e.ex))
      fail("Ongeldige uitzonderingen");
    for (const d of e.ex || []) checkDate(d, true);
    if (e.tm !== undefined && !object(e.tm)) fail("Ongeldige weektijden");
    for (const tm of Object.values(e.tm || {})) checkTime(tm);
    if (e.te !== undefined && !object(e.te)) fail("Ongeldige weekeindtijden");
    for (const time of Object.values(e.te || {})) checkTime(time);
    if (e.rem !== undefined && !Array.isArray(e.rem))
      fail("Ongeldige herinneringen");
    for (const r of e.rem || []) {
      if (!object(r) || !Number.isFinite(r.min) || r.min < 0 || r.min > 20160)
        fail("Ongeldige herinnering");
      checkDate(r.date);
      if (r.dow != null && (!Number.isInteger(r.dow) || r.dow < 0 || r.dow > 6))
        fail("Ongeldige herinneringsdag");
    }
  }
  const itemIds = new Set();
  for (const l of s.lists || []) {
    text(l.n, true);
    if (!Array.isArray(l.items)) fail("Ongeldige taken");
    for (const i of l.items) {
      if (!object(i) || !safeId(i.id) || itemIds.has(i.id))
        fail("Ontbrekende of dubbele taak");
      itemIds.add(i.id);
      text(i.t, true);
      text(i.note);
      checkP(i.p);
      if (i.reminders !== undefined && !Array.isArray(i.reminders))
        fail("Ongeldige taakherinneringen");
      for (const r of i.reminders || []) {
        if (
          !object(r) ||
          !safeId(r.id) ||
          !validDate(r.d) ||
          !validTime(r.time)
        )
          fail("Ongeldige taakherinnering");
      }
    }
  }
  for (const n of s.notes || []) {
    for (const k of ["title", "text", "wat", "ver", "act"]) text(n[k]);
    checkDate(n.date);
    if (n.scope && !["dag", "algemeen"].includes(n.scope))
      fail("Ongeldige notitiesoort");
    if (
      n.link &&
      (!object(n.link) ||
        !["h", "g", "e", "i", "d"].includes(n.link.t) ||
        typeof n.link.id !== "string")
    )
      fail("Ongeldige notitiekoppeling");
    if (n.link?.t === "d") checkDate(n.link.id, true);
    for (const k of ["c", "u"])
      if (n[k] && !Number.isFinite(Date.parse(n[k])))
        fail("Ongeldige notitiedatum");
  }
  for (const r of s.reminders || []) {
    text(r.title, true);
    checkDate(r.d, true);
    if (!validTime(r.time)) fail("Ongeldig tijdstip");
    checkP(r.p);
  }
  for (const l of s.logs || []) {
    checkDate(l.d, true);
    if (!Number.isFinite(l.a) || l.a <= 0 || typeof l.gid !== "string")
      fail("Ongeldige registratie");
  }
  for (const k of Object.keys(s.done || {})) {
    const [d, id, m] = k.split("|");
    checkDate(d, true);
    if (!id || !/^\d+$/.test(m)) fail("Ongeldig vinkje");
  }
  if (j.P !== undefined && !object(j.P)) fail("Ongeldige fotoverzameling");
  for (const photo of Object.values(j.P || {}))
    if (
      typeof photo !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,[a-z\d+/=]+$/i.test(photo)
    )
      fail("Ongeldige foto");
  const state = migrate(s, t);
  return { S: state, P: structuredClone(j.P || {}) };
}
export const backup = (S, P) => ({
  app: "dagritme",
  v: SCHEMA,
  exportedAt: new Date().toISOString(),
  S: structuredClone(S),
  P: structuredClone(P),
});
export function durationLabel(m) {
  return !m ? "" : m % 60 === 0 ? `${m / 60} uur` : `${m} min`;
}
export function goalUnit(g, d = today()) {
  const v = version(g, d) || g;
  return (
    {
      aantal: "keer",
      km: "km",
      minuten: "min",
      uren: "uur",
      eigen: v.unit || g.unit || "eenheden",
    }[v.type || g.type] || "keer"
  );
}
/** Resolve Dutch wall time explicitly; skip nonexistent spring-forward times.
 * Repeated autumn times use the first occurrence (exactly one notification). */
export function localToUTC(d, t) {
  if (!validDate(d) || !validTime(t)) return null;
  const [y, m, dd] = d.split("-").map(Number),
    [h, mi] = t.split(":").map(Number),
    guess = Date.UTC(y, m - 1, dd, h, mi);
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const offset of [120, 60]) {
    const at = guess - offset * 60000;
    if (format.format(new Date(at)).replace(" ", "T") === `${d}T${t}`)
      return at;
  }
  return null;
}

export function occurrences(s, d) {
  const out = [];
  for (const e of s.events) {
    if (
      e.rec
        ? e.d <= d &&
          (!e.end || d <= e.end) &&
          e.days.includes(dow(d)) &&
          !e.ex.includes(d)
        : e.d === d
    ) {
      const start = e.allday ? "" : e.rec ? e.tm[dow(d)] || e.s : e.s;
      const plus = (time, min) => {
        const n = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + min;
        return (
          String(Math.floor(n / 60) % 24).padStart(2, "0") +
          ":" +
          String(n % 60).padStart(2, "0") +
          (n >= 1440 ? " (+1 dag)" : "")
        );
      };
      let end = e.allday ? "" : e.rec ? e.te?.[dow(d)] || e.e : e.e;
      if (start && !end && e.duration) end = plus(start, e.duration);
      if (e.rec && start && e.s && e.e && !e.te?.[dow(d)] && start !== e.s) {
        const minutes = (time) =>
          Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
        end = plus(start, (minutes(e.e) - minutes(e.s) + 1440) % 1440);
      }
      out.push({ e, d, s: start, end });
    }
  }
  return out.sort((a, b) => (a.s || "").localeCompare(b.s || ""));
}
export function reminders(s, now = Date.now()) {
  const out = [],
    t = ymd(new Date(now)),
    until = now + 35 * 86400000;
  const push = (id, at, title, body) => {
    if (at !== null && at >= now && at <= until)
      out.push({ id: id + "@" + at, at, title, body });
  };
  // Include occurrences beyond the delivery horizon for reminders up to 14 days early.
  for (let i = 0; i <= 49; i++) {
    const d = add(t, i);
    for (const o of occurrences(s, d)) {
      if (s.edone[o.e.id + "|" + d]) continue;
      const base = localToUTC(d, o.e.allday || !o.s ? "09:00" : o.s);
      if (base === null) continue;
      for (const r of o.e.rem || []) {
        if (
          (r.dow != null && Number(r.dow) !== dow(d)) ||
          (r.date && r.date !== d)
        )
          continue;
        push(
          `e:${o.e.id}:${d}:${r.id}`,
          base - r.min * 60000,
          o.e.t,
          r.min ? `${r.min} minuten tot je afspraak` : "Je afspraak begint",
        );
      }
    }
    for (const h of s.habits) {
      const v = schedule(h, d);
      if (!v) continue;
      for (const raw of h.hrem || []) {
        const r = typeof raw === "string" ? { time: raw } : raw;
        if (
          (r.dow != null && Number(r.dow) !== dow(d)) ||
          (r.moment && r.moment > v.count)
        )
          continue;
        const isDone = r.moment
          ? s.done[`${d}|${h.id}|${r.moment}`]
          : Array.from(
              { length: v.count },
              (_, k) => s.done[`${d}|${h.id}|${k + 1}`],
            ).every(Boolean);
        if (!isDone)
          push(
            `h:${h.id}:${d}:${r.time}:${r.moment || 0}`,
            localToUTC(d, r.time),
            h.n,
            r.moment ? `Tijd voor moment ${r.moment}` : "Tijd voor je gewoonte",
          );
      }
    }
    for (const g of s.goals) {
      if (
        d < g.start ||
        (g.end && d > g.end) ||
        (g.ae && d > g.ae) ||
        (g.pz || []).some((p) => d >= p.from && (!p.to || d < p.to))
      )
        continue;
      const w = monday(d),
        v = version(g, add(w, 6));
      if (!v) continue;
      const sum = s.logs
        .filter((l) => l.gid === g.id && l.d >= w && l.d <= add(w, 6))
        .reduce((n, l) => n + l.a, 0);
      if (sum >= v.target) continue;
      for (const raw of g.hrem || []) {
        const r = typeof raw === "string" ? { time: raw } : raw;
        if (r.dow != null && Number(r.dow) !== dow(d)) continue;
        push(
          `g:${g.id}:${d}:${r.time}`,
          localToUTC(d, r.time),
          g.n,
          "Tijd voor je weekdoel",
        );
      }
    }
  }
  for (const l of s.lists)
    for (const i of l.items)
      if (!i.done)
        for (const r of i.reminders || [])
          push(
            `i:${i.id}:${r.id}`,
            localToUTC(r.d, r.time),
            i.t,
            "Je taak wacht op je",
          );
  for (const r of s.reminders || [])
    push(`r:${r.id}`, localToUTC(r.d, r.time), r.title, "Je herinnering");
  return [...new Map(out.map((r) => [r.id, r])).values()].sort(
    (a, b) => a.at - b.at,
  );
}
