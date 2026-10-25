/* BuzzCam: a fictional adult (18+) livestream platform for SillyTavern roleplay.
   Global settings live in extension_settings.buzzcam; everything else is stored per chat in chat metadata. */
import { getContext, extension_settings } from '../../../extensions.js';

const MOD = 'buzzcam';
const DEF = { profileId: '', summaryProfileId: '', popularity: 0, wallet: 0, rate: 0.01, currency: 'USD', phoneLink: false, botMods: true, inject: true, echo: false, chatMode: 'auto', commentMode: 'auto', streamerWho: 'char', floatBtn: true, maxEvents: 6, cashed: 0, minPerMsg: 5 };
const GRADES = [
    { n: 'Beginner', v: [3, 40], s: [4, 90], ev: [1, 3], d: 'a small new streamer with a handful of regulars; chat is quiet and friendly, tips are small' },
    { n: 'Rising', v: [60, 500], s: [150, 1500], ev: [3, 5], d: 'a growing streamer with a loyal chat; steady chatter and regular tips' },
    { n: 'Popular', v: [800, 9000], s: [3000, 40000], ev: [4, 8], d: 'a well-known streamer with a busy, fast chat; big tippers, frequent requests, hype trains' },
];
const PRESETS = [{ n: 'Small drip', a: 5, i: 'fa-droplet' }, { n: 'Honey drop', a: 25, i: 'fa-fill-drip' }, { n: 'Comb combo', a: 100, i: 'fa-cubes' }, { n: 'Golden jar', a: 500, i: 'fa-crown' }];
const TIERS = ['', 'Worker Bee', 'Royal Jelly', "Queen's Guard"];
const ROLES = { viewer: { tip: 1, request: 1, moderate: 0 }, subscriber: { tip: 1, request: 1, moderate: 0 }, patron: { tip: 1, request: 1, moderate: 0 }, mod: { tip: 0, request: 0, moderate: 1 }, cohost: { tip: 0, request: 0, moderate: 1 } };
const ROLEI = { mod: 'fa-shield-halved', cohost: 'fa-microphone', subscriber: 'fa-star', patron: 'fa-crown' };
const TABS = [['profile', 'Channel', 'fa-id-badge'], ['community', 'Community', 'fa-newspaper'], ['stream', 'Stream room', 'fa-video'], ['history', 'History', 'fa-clock-rotate-left'], ['cast', 'Cast', 'fa-users'], ['settings', 'Settings', 'fa-gear']];

let stGen = false, tab = 'profile', isOpen = false, busy = false, dirty = false, draft = { img: '', text: '', desc: '' };

/* ---------- helpers ---------- */
const ctx = () => getContext();
const $q = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = n => Number(n || 0).toLocaleString();
const S = () => extension_settings[MOD];
const saveS = () => ctx().saveSettingsDebounced();
const dur = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
const clean = t => String(t || '').replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>/gi, '').replace(/<offcam>[\s\S]*?<\/offcam>/gi, '').replace(/\(\([\s\S]*?\)\)/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 900);
const bee = id => `<svg viewBox="0 0 48 48" class="bz-bee"><defs><clipPath id="bzc${id}"><ellipse cx="24" cy="29" rx="13" ry="15"/></clipPath></defs><ellipse cx="16" cy="12" rx="8" ry="5" fill="#ffe9a8" opacity=".85" transform="rotate(-25 16 12)"/><ellipse cx="32" cy="12" rx="8" ry="5" fill="#ffe9a8" opacity=".85" transform="rotate(25 32 12)"/><ellipse cx="24" cy="29" rx="13" ry="15" fill="#ffb627"/><g clip-path="url(#bzc${id})"><path d="M8 25h32M8 32h32M8 39h32" stroke="#17100a" stroke-width="4"/></g></svg>`;

function initSettings() { extension_settings[MOD] = Object.assign({}, DEF, extension_settings[MOD] || {}); }
function newChat() { return { on: true, p: { name: '', avatar: '', thumb: '', bio: '', schedule: '', tags: '', bounds: '', consent18: false, consentExplicit: false }, posts: [], cast: [], hist: [], subs: 0, subsG: -1, st: null }; }
function C() { const md = ctx().chatMetadata; if (!md) return null; if (!md[MOD]) md[MOD] = newChat(); return md[MOD]; }
function save() { const c = ctx(); (c.saveMetadataDebounced || c.saveMetadata)?.call(c); }
const defName = () => { const w = S().streamerWho, x = ctx(); return w === 'user' ? x.name1 : w === 'both' ? `${x.name2} & ${x.name1}` : x.name2; };
const streamer = () => C()?.p.name || defName() || 'Streamer';
const profiles = () => (extension_settings.connectionManager?.profiles || []).filter(p => p && p.id);
function ensureSubs() { const c = C(), g = GRADES[S().popularity]; if (c.subsG !== S().popularity) { c.subs = rnd(g.s[0], g.s[1]); c.subsG = S().popularity; save(); } }
const memberOf = n => C().cast.find(m => m.name.toLowerCase() === String(n).toLowerCase());
function permsOf(n) { const m = memberOf(n); return { m, ...(m ? (m.perms || ROLES[m.role]) : ROLES.viewer) }; }

/* ---------- Phone-ST bridge (best-effort; wire to the real API once known) ---------- */
function phoneAPI() { const w = window; return w.PhoneST || w.phoneST || w.Phone_ST || w.STPhone || w.stPhone || null; }
function phoneCurrency() { try { const P = phoneAPI(), B = P?.bank || P; const v = B?.getCurrency?.() ?? B?.currency ?? P?.currency; return typeof v === 'string' ? v : (v?.code || v?.symbol || ''); } catch { return ''; } }
async function phoneDeposit(amount, note) {
    const P = phoneAPI(); if (!P) return false; const B = P.bank || P.Bank || P;
    for (const fn of ['deposit', 'addFunds', 'addMoney', 'credit', 'topUp']) {
        if (typeof B[fn] === 'function') { try { const r = await B[fn](amount, note); if (r !== false) return true; } catch (e) { console.warn('[BuzzCam] phone', fn, e); } }
    }
    return false;
}
function parseTime(t) {
    let best = null, x; const re = /\b(\d{1,2}):(\d{2})\s*([ap])\.?m\b\.?|\b(\d{1,2}):(\d{2})\b/gi;
    while ((x = re.exec(t))) {
        let h = +(x[1] ?? x[4]), mi = +(x[2] ?? x[5]); if (mi > 59) continue;
        if (x[3]) { if (h < 1 || h > 12) continue; h = h % 12 + (x[3].toLowerCase() === 'p' ? 12 : 0); } else if (h > 23) continue;
        best = h * 60 + mi;
    }
    return best;
}
function readClock() {
    try { const H = window.Horae; if (H) { const v = H.story_time ?? H.getStoryTime?.() ?? H.getState?.()?.story_time ?? H.state?.story_time; const m = parseTime(String(v ?? '')); if (m != null) return m; } } catch { /* ignore */ }
    const ch = ctx().chat || [];
    for (let i = ch.length - 1; i >= Math.max(0, ch.length - 4); i--) { const m = parseTime(String(ch[i]?.mes || '').replace(/<[^>]+>/g, ' ')); if (m != null) return m; }
    return null;
}
function tickClock() {
    const st = C()?.st; if (!st) return; const t = readClock(); if (t == null) return; const k = st.clk;
    if (!k) { st.clk = { base: t, last: t, wraps: 0 }; return; }
    if (t < k.last - 120) { k.wraps++; k.last = t; } else if (t > k.last) k.last = t;
}
function uptimeMin() { const st = C()?.st; if (!st) return 0; const k = st.clk; return k ? Math.max(0, k.wraps * 1440 + k.last - k.base) : (st.msgs || 0) * S().minPerMsg; }
const fmtMin = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
const curCode = () => (S().phoneLink && phoneCurrency()) || S().currency;

/* ---------- LLM ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitIdle() { for (let i = 0; i < 40 && stGen; i++) await sleep(500); }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error(`The model did not answer within ${ms / 1000}s`)), ms))]);
const norm = r => typeof r === 'string' ? r : Array.isArray(r) ? r.map(norm).join('') : r == null ? '' : (r.content !== undefined ? norm(r.content) : (r.choices?.[0]?.message?.content ?? r.text ?? ''));
async function callLLM(pid, sys, usr, max) {
    await waitIdle();
    try { return await withTimeout(callOnce(pid, sys, usr, max), 120000); }
    catch (e) {
        if (!/abort/i.test(String(e?.name || '') + String(e?.message || e))) throw e;
        console.warn('[BuzzCam] request aborted, retrying once'); await sleep(2500); await waitIdle(); return await withTimeout(callOnce(pid, sys, usr, max), 120000);
    }
}
async function callOnce(pid, sys, usr, max) {
    const c = ctx();
    if (pid && c.ConnectionManagerRequestService) {
        const r = await c.ConnectionManagerRequestService.sendRequest(pid, [{ role: 'system', content: sys }, { role: 'user', content: usr }], max, { extractData: true, includePreset: true, includeInstruct: false });
        return norm(r);
    }
    try { return norm(await c.generateRaw({ prompt: usr, systemPrompt: sys, responseLength: max })); }
    catch (e) { if (/abort/i.test(String(e?.name || e?.message || e))) throw e; return norm(await c.generateRaw(usr, null, false, false, sys, max)); }
}
function parseEvents(raw) {
    let t = String(raw || '').replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>/gi, '').replace(/```(json)?/gi, '');
    const a = t.indexOf('['), b = t.lastIndexOf(']');
    if (a >= 0 && b > a) { try { const r = JSON.parse(t.slice(a, b + 1)); if (Array.isArray(r)) return r; } catch { /* fall through */ } }
    const out = []; (t.match(/\{[^{}]*\}/g) || []).forEach(o => { try { out.push(JSON.parse(o)); } catch { /* skip */ } });
    return out;
}

/* ---------- stream state ---------- */
function feed(it) { const st = C().st; it.id = uid(); it.ts = Date.now(); st.feed.push(it); if (st.feed.length > 150) st.feed.splice(0, st.feed.length - 150); }
function gain(name, amt, msg) {
    const c = C(), st = c.st; S().wallet += amt; saveS(); st.earned += amt; st.tips++; st.goal.cur += amt;
    feed({ t: 'tip', who: name, amt, text: msg || '' }); st.don.push({ id: uid(), name, amt, msg: msg || '', state: 'new' });
    if (S().echo) sysToChat(`${name} tipped ${amt} Honey Tokens${msg ? ': “' + msg + '”' : ''}`);
    if (!st.goalHit && st.goal.target > 0 && st.goal.cur >= st.goal.target) { st.goalHit = true; feed({ t: 'sys', text: `Goal reached: ${st.goal.label || 'Stream goal'}!` }); }
}
function sysToChat(text) { try { const c = ctx(), m = { name: 'BuzzCam', is_user: false, is_system: true, mes: text, send_date: Date.now(), extra: { type: 'narrator', isSmallSys: true } }; c.chat.push(m); c.addOneMessage(m); c.saveChat?.(); } catch (e) { console.warn(e); } }
function allowedInPrivate(name) {
    const st = C().st; if (!st.priv) return true; const m = memberOf(name);
    if (st.priv.kind === 'patron') return name.toLowerCase() === st.priv.patron.toLowerCase() || (m && (m.role === 'mod' || m.role === 'cohost'));
    if (m) return m.role === 'mod' || m.role === 'cohost' || ((m.role === 'subscriber' || m.role === 'patron') && (m.tier || 1) >= st.priv.tier);
    return true;
}
function applyEvent(ev) {
    const c = C(), st = c.st; if (!ev || typeof ev !== 'object') return;
    const type = String(ev.type || 'chat').toLowerCase(), name = String(ev.name || ev.user || '').trim().slice(0, 32);
    if (!name) return; const low = name.toLowerCase();
    if (st.muted.includes(low) || st.banned.includes(low) || !allowedInPrivate(name)) return;
    const pr = permsOf(name), text = String(ev.text || '').trim().slice(0, 300), role = pr.m?.role || (st.priv ? 'subscriber' : 'viewer');
    if (type === 'chat') { if (text) feed({ t: 'chat', who: name, role, text }); }
    else if (type === 'tip') { if (pr.tip) gain(name, clamp(Math.round(+ev.amount || 5), 1, 5000), text); }
    else if (type === 'request') {
        if (!pr.request || !text) return; const price = clamp(Math.round(+ev.amount || 0), 0, 5000);
        st.req.push({ id: uid(), name, text, price, status: 'pending' }); feed({ t: 'req', who: name, role, text: `requested: ${text}${price ? ` (${price} tokens)` : ''}` });
    } else if (type === 'mod') {
        if (!S().botMods || !pr.moderate) return; const tg = String(ev.target || '').trim().slice(0, 32), tl = tg.toLowerCase(), tm = memberOf(tg);
        if (!tg || (tm && (tm.role === 'mod' || tm.role === 'cohost'))) return; const ban = String(ev.action).toLowerCase() === 'ban';
        (ban ? st.banned : st.muted).push(tl); feed({ t: 'mod', text: `${name} ${ban ? 'banned' : 'muted'} ${tg}${ev.reason ? ': ' + String(ev.reason).slice(0, 80) : ''}` });
    }
}
function capture(id) {
    const c = C(); if (!c || !c.on || !c.st) return false; const m = ctx().chat[id]; if (!m || m.is_system) return false;
    const w = S().streamerWho; if ((w === 'char' && m.is_user) || (w === 'user' && !m.is_user)) return false;
    const text = clean(m.mes); if (!text) return false; const who = m.name || (m.is_user ? ctx().name1 : ctx().name2), b = c.st.buf, ex = b.find(x => x.id === id);
    if (ex) { ex.text = text; ex.who = who; } else { b.push({ id, who, text }); c.st.msgs = (c.st.msgs || 0) + 1; } tickClock(); if (b.length > 80) b.shift(); save(); return true;
}
async function genViewers(force) {
    const c = C(), st = c?.st; if (!c || !c.on || !st) return;
    if (busy) { dirty = true; return; }
    if (!st.buf.length) { if (force === true) toastr.info('Nothing has happened on camera yet.'); return; }
    busy = true; $q('#bz-root')?.classList.add('bz-busy');
    try {
        const s = S(), g = GRADES[s.popularity], n = clamp(rnd(g.ev[0], g.ev[1]), 1, s.maxEvents), pv = st.priv;
        const cast = c.cast.map(m => `- ${m.name} [${m.role}${m.tier ? ', tier ' + m.tier : ''}] can: ${['tip', 'request', 'moderate'].filter(k => (m.perms || ROLES[m.role])[k]).join('/') || 'chat only'}. ${m.persona || ''}`).join('\n') || '(no named cast; invent viewers)';
        const sys = `You write the live chat for BuzzCam, a fictional adult-only (18+) livestream site inside a roleplay. Everyone on it is a fictional adult. Explicit sexual language is normal here when it fits the stream.
Rules:
- Viewers ONLY know what is visible or audible on stream (the SCENE below). They cannot read minds and know nothing about off-camera events, private thoughts, or anything before the stream began.
- Write ONLY audience and cast reactions. Never write the streamer's own words or actions.
- If anyone on stream appears to be under 18, return [].
- Respect the streamer's boundaries; requests must stay within them.
- Reply with a JSON array and nothing else. Items: {"type":"chat","name":"","text":""} | {"type":"tip","name":"","amount":5,"text":""} | {"type":"request","name":"","text":"","amount":0} | {"type":"mod","action":"mute|ban","name":"<a moderator>","target":"","reason":""}${s.botMods ? '' : ' (do NOT use mod items)'}
- Same language as the scene. Chat lines under 160 characters, varied styles, emotes, honey/bee flavoured usernames allowed. Tip amounts are Honey Tokens, typical values ${PRESETS.map(p => p.a).join(', ')}.
- Streamer level: ${g.n}, ${g.d}.
Cast and what each role may do (viewers outside the cast may chat, tip and request):
${cast}`;
        const usr = `Stream: "${st.title}" by ${streamer()} (${pv ? (pv.kind === 'patron' ? `PRIVATE show for patron ${pv.patron} only` : `PRIVATE show for subscribers of ${TIERS[pv.tier]} and above`) : 'public'}). Viewers: ${st.viewers}. Live for ${fmtMin(uptimeMin())} of story time. Goal: ${st.goal.label || 'none'} ${st.goal.cur}/${st.goal.target}.
Streamer bio: ${c.p.bio || '-'}. Tags: ${c.p.tags || '-'}. Boundaries: ${c.p.bounds || 'none stated'}.
Recent chat:\n${st.feed.filter(f => f.t === 'chat').slice(-10).map(f => `${f.who}: ${f.text}`).join('\n') || '(empty)'}
Open requests: ${st.req.filter(r => r.status === 'pending').map(r => `${r.name}: ${r.text}`).join(' | ') || 'none'}
Recent decisions: ${st.req.filter(r => r.status !== 'pending').slice(-4).map(r => `${r.name}'s request ${r.status}${r.reason ? ' (' + r.reason + ')' : ''}`).join(' | ') || 'none'}
Never use these names (muted/banned): ${[...st.muted, ...st.banned].join(', ') || 'none'}
SCENE (on camera, newest last):\n${st.buf.slice(-6).map(b => `${b.who}: ${b.text.slice(0, 700)}`).join('\n')}
Write ${n} new events reacting to the latest part of the scene.`;
        const raw = await callLLM(s.profileId, sys, usr, 1200), arr = parseEvents(raw);
        if (!arr.length) { console.warn('[BuzzCam] unreadable reply:', raw); const m = raw.trim() ? 'The model replied but no chat events could be read: ' + raw.trim().slice(0, 140) : 'The model returned an empty reply (reasoning models may need a bigger token budget).'; feed({ t: 'sys', text: m }); toastr.warning(m); }
        arr.slice(0, n + 2).forEach(applyEvent);
        if (st.auto) { const r = pv ? [1, Math.max(1, c.subs)] : g.v; st.viewers = clamp(Math.round(st.viewers * (1 + (Math.random() - 0.42) * 0.12)), r[0], r[1]); }
        st.peak = Math.max(st.peak, st.viewers); st.gen++;
    } catch (e) { console.warn('[BuzzCam]', e); feed({ t: 'sys', text: 'Chat simulation failed: ' + (e.message || e) }); toastr.error('BuzzCam chat failed: ' + (e.message || e)); }
    finally { busy = false; $q('#bz-root')?.classList.remove('bz-busy'); save(); live(); if (dirty) { dirty = false; setTimeout(genViewers, 400); } }
}
function inject() {
    const c = C(), s = S(), st = c?.st; let txt = '';
    if (c && c.on && s.inject && st) {
        const chat = st.feed.filter(f => f.t === 'chat').slice(-8).map(f => `${f.who}: ${f.text}`).join('\n');
        const don = st.don.filter(d => d.state !== 'read').slice(0, 5).map(d => `${d.name} tipped ${d.amt} Honey Tokens${d.msg ? ` ("${d.msg}")` : ''}`).join('\n');
        const req = st.req.filter(r => r.status === 'accepted').map(r => `${r.name}: ${r.text}`).join('\n');
        txt = `[BuzzCam: ${streamer()} is LIVE on an adult 18+ streaming site, streaming "${st.title}"${st.priv ? ' (private show)' : ''} for about ${st.viewers} viewers. Everything said and done on screen is seen by viewers; they know nothing about off-camera events. Audience chat and alerts are displayed separately, so do not write viewer messages yourself, but the streamer may react to them naturally.${chat ? `\nLatest chat:\n${chat}` : ''}${don ? `\nNew tips to acknowledge:\n${don}` : ''}${req ? `\nRequests the streamer agreed to:\n${req}` : ''}${st.goal.target ? `\nGoal "${st.goal.label}": ${st.goal.cur}/${st.goal.target} tokens.` : ''}]`;
    }
    ctx().setExtensionPrompt(MOD, txt, 1, 1, false, 0);
}

/* ---------- actions ---------- */
function startStream() {
    const c = C(); if (!c.p.consent18 || !c.p.consentExplicit) return toastr.warning('Confirm both consent boxes first.');
    ensureSubs(); const mode = $q('#bz-f-mode').value, g = GRADES[S().popularity]; let priv = null;
    if (mode === 'tier') priv = { kind: 'tier', tier: +$q('#bz-f-tier').value || 1 };
    if (mode === 'patron') {
        const n = $q('#bz-f-pat').value.trim(); if (!n) return toastr.warning('Choose a patron.'); priv = { kind: 'patron', patron: n };
        if (!memberOf(n)) c.cast.push({ id: uid(), name: n, role: 'patron', tier: 3, persona: '', perms: { ...ROLES.patron } });
    }
    const v = !priv ? rnd(g.v[0], g.v[1]) : priv.kind === 'patron' ? 1 : Math.max(1, Math.round(c.subs * rnd(3, 9) / 100 / priv.tier));
    c.st = { title: $q('#bz-f-title').value.trim() || 'Untitled stream', start: Date.now(), viewers: v, peak: v, auto: true, goal: { label: $q('#bz-f-goal').value.trim(), target: Math.max(0, parseInt($q('#bz-f-target').value) || 0), cur: 0 }, earned: 0, tips: 0, priv, feed: [], don: [], req: [], muted: [], banned: [], buf: [], gen: 0 };
    tickClock(); feed({ t: 'sys', text: priv ? 'Private show started' : 'Stream started' }); inject(); save(); fabState(); view(); head();
}
function stopStream() {
    const c = C(), st = c.st; if (!st) return; tickClock(); const g = GRADES[S().popularity];
    const gained = st.priv ? 0 : rnd(0, Math.max(1, Math.round((g.s[1] - g.s[0]) / 40))); c.subs += gained;
    c.hist.unshift({ id: uid(), title: st.title, start: st.start, end: Date.now(), mins: uptimeMin(), peak: st.peak, earned: st.earned, tips: st.tips, gained, priv: st.priv ? (st.priv.kind === 'patron' ? 'Patron: ' + st.priv.patron : TIERS[st.priv.tier] + '+') : '', done: st.req.filter(r => r.status === 'accepted' || r.status === 'done').length, log: st.buf.slice(-60).map(b => [b.who, b.text.slice(0, 500)]), hl: st.feed.filter(f => ['tip', 'req', 'mod', 'sys'].includes(f.t)).slice(-25).map(f => f.t === 'tip' ? `${f.who} tipped ${f.amt}${f.text ? ': ' + f.text : ''}` : f.text), summary: '' });
    c.st = null; inject(); save(); fabState(); view(); head();
}
function toggleChat(force) { const c = C(); if (!c) return; c.on = typeof force === 'boolean' ? force : !c.on; inject(); save(); fabState(); view(); head(); }
function tip(a) { const c = C(); if (!c?.st || !(a > 0)) return; gain(($q('#bz-tipper')?.value || '').trim() || ctx().name1 || 'Anonymous bee', Math.min(a, 5000), ''); inject(); save(); live(); }
async function summarize(id) {
    const c = C(), h = c.hist.find(x => x.id === id); if (!h || h.busy) return; h.busy = 1; view();
    try {
        const sys = 'You write short, neutral recaps of fictional adult livestreams for a roleplay log. Explicit events may be described plainly and briefly. Reply with the recap only.';
        const usr = `Stream "${h.title}" by ${streamer()}${h.priv ? ' (private show: ' + h.priv + ')' : ''}.\nOn-camera log:\n${h.log.map(l => `${l[0]}: ${l[1]}`).join('\n')}\nHighlights:\n${h.hl.join('\n')}\nWrite a recap of 4-7 sentences: what the stream was about, the mood, notable tips and requests, how it ended. Use the language of the log.`;
        h.summary = String(await callLLM(S().summaryProfileId || S().profileId, sys, usr, 500)).trim();
    } catch (e) { toastr.error('Summary failed: ' + (e.message || e)); }
    h.busy = 0; save(); view();
}
async function genComments(id) {
    const c = C(), p = c.posts.find(x => x.id === id); if (!p || p.busy) return; p.busy = 1; view();
    try {
        const g = GRADES[S().popularity], n = clamp(rnd(g.ev[0], g.ev[1]), 2, 6);
        const cast = c.cast.map(m => `- ${m.name} [${m.role}] ${m.persona || ''}`).join('\n') || '(no named cast; invent followers)';
        const sys = `You write follower comments under a post on BuzzCam, a fictional adult-only (18+) streaming site inside a roleplay. Everyone is a fictional adult; explicit language is fine when it fits. Comment only on what the post shows. Reply with a JSON array and nothing else: [{"name":"","text":""}]. Short, varied comments (under 200 characters), honey/bee flavoured usernames allowed, same language as the post.${p.subs ? ' This is a subscribers-only post, so commenters are paying subscribers.' : ''}
Known cast (may comment in character):\n${cast}`;
        const usr = `Streamer: ${streamer()}. Level: ${g.n}. Boundaries: ${c.p.bounds || 'none stated'}.\nPost: ${p.text || '(no text)'}\n${p.img ? 'Image: ' + (p.desc || '(attached, not described)') : ''}\nExisting comments:\n${(p.comments || []).slice(-5).map(k => `${k.name}: ${k.text}`).join('\n') || 'none'}\nWrite ${n} new comments.`;
        const raw = await callLLM(S().profileId, sys, usr, 1000), arr = parseEvents(raw).filter(k => k && k.name && k.text);
        if (!arr.length) { console.warn('[BuzzCam] unreadable reply:', raw); toastr.warning(raw.trim() ? 'The model replied but no comments could be read: ' + raw.trim().slice(0, 140) : 'The model returned an empty reply.'); }
        p.comments = (p.comments || []).concat(arr.slice(0, n + 2).map(k => ({ name: String(k.name).slice(0, 32), text: String(k.text).slice(0, 300) }))).slice(-40);
    } catch (e) { toastr.error('Comments failed: ' + (e.message || e)); }
    p.busy = 0; save(); view();
}
async function cashOut() {
    const s = S(), amt = Math.floor(+$q('#bz-cash')?.value || 0);
    if (!(amt > 0) || amt > s.wallet) return toastr.warning('Enter an amount up to your balance.');
    const money = +(amt * s.rate).toFixed(2);
    if (s.phoneLink && !(await phoneDeposit(money, `BuzzCam cash-out (${amt} Honey Tokens)`))) return toastr.error('Phone-ST bank not reachable. Check the link in Settings.');
    s.wallet -= amt; s.cashed += money; saveS(); modal(''); head(); toastr.success(`Converted ${fmt(amt)} tokens to ${money.toFixed(2)} ${curCode()}${s.phoneLink ? ' (sent to phone bank)' : ''}.`);
}

/* ---------- images ---------- */
function shrink(file, max, q = 0.78) {
    return new Promise((res, rej) => {
        const r = new FileReader(); r.onerror = rej;
        r.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', q)); }; im.src = r.result; };
        r.readAsDataURL(file);
    });
}

/* ---------- views ---------- */
const chip = (t, c = '') => `<span class="bz-chip ${c}">${esc(t)}</span>`;
function vProfile() {
    const c = C(), p = c.p, g = GRADES[S().popularity]; ensureSubs();
    const ver = p.consent18 ? `<span class="bz-ver"><i class="fa-solid fa-circle-check"></i> 18+ verified (fictional)</span>` : `<span class="bz-chip warn">Not verified yet</span>`;
    return `<div class="bz-card bz-chan"><div class="bz-banner" style="${p.thumb ? `background-image:url('${p.thumb}')` : ''}"><label class="bz-chip bz-up"><i class="fa-solid fa-image"></i> Thumbnail<input type="file" accept="image/*" hidden data-img="thumb"></label></div>
<div class="bz-chanrow"><div class="bz-hexav" style="${p.avatar ? `background-image:url('${p.avatar}')` : ''}"><label class="bz-hexup"><i class="fa-solid fa-camera"></i><input type="file" accept="image/*" hidden data-img="avatar"></label></div>
<div class="bz-chaninfo"><h2>${esc(p.name || defName() || 'Streamer')} ${ver}</h2><div class="bz-meta"><span>${fmt(c.subs)} subscribers</span><span>${g.n} streamer</span><span>${c.hist.length} past streams</span></div><div class="bz-tags">${String(p.tags).split(',').map(t => t.trim()).filter(Boolean).map(t => chip('#' + t)).join('')}</div></div></div></div>
<div class="bz-cols"><div class="bz-card"><h3>Profile</h3>
<label>Username<input data-p="name" value="${esc(p.name)}" placeholder="${esc(defName() || 'Streamer')}"></label>
<label>Bio<textarea data-p="bio" rows="3">${esc(p.bio)}</textarea></label>
<label>Schedule<input data-p="schedule" value="${esc(p.schedule)}" placeholder="Fri and Sat nights, 22:00"></label>
<label>Tags (comma separated)<input data-p="tags" value="${esc(p.tags)}" placeholder="cozy, roleplay, late night"></label></div>
<div class="bz-card"><h3>Consent and boundaries</h3>
<label class="bz-chk"><input type="checkbox" data-p="consent18" ${p.consent18 ? 'checked' : ''}><span>Everyone taking part is a fictional adult (18+)</span></label>
<label class="bz-chk"><input type="checkbox" data-p="consentExplicit" ${p.consentExplicit ? 'checked' : ''}><span>Explicit content is welcome on this channel</span></label>
<label>Boundaries and hard limits<textarea data-p="bounds" rows="5" placeholder="Viewer requests will be kept inside these limits.">${esc(p.bounds)}</textarea></label>
<p class="bz-note">Both boxes are required before you can go live. Boundaries are passed to the viewer simulation.</p></div></div>`;
}
function vCommunity() {
    const c = C(), p = c.p, av = p.avatar ? `style="background-image:url('${p.avatar}')"` : '';
    const posts = c.posts.slice().reverse().map(x => `<article class="bz-card bz-post"><div class="bz-ph"><span class="bz-hexs" ${av}></span><b>${esc(streamer())}</b><time>${new Date(x.ts).toLocaleString()}</time>${x.subs ? `<span class="bz-chip lock"><i class="fa-solid fa-lock"></i> Subscribers only</span>` : chip('Public')}<button class="bz-ic" data-act="post-del" data-id="${x.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></div><p>${esc(x.text)}</p>${x.img ? `<img class="bz-pimg" src="${x.img}">` : ''}${x.desc ? `<small class="bz-alt">${esc(x.desc)}</small>` : ''}${(x.comments || []).length ? `<div class="bz-cm">${x.comments.map(k => `<p><b>${esc(k.name)}</b> ${esc(k.text)}</p>`).join('')}</div>` : ''}<button class="bz-link" data-act="post-com" data-id="${x.id}" ${x.busy ? 'disabled' : ''}>${x.busy ? 'Generating comments…' : (x.comments || []).length ? 'More comments' : 'Generate comments'}</button></article>`).join('');
    return `<div class="bz-card"><h3>New post</h3><textarea id="bz-ptext" rows="3" placeholder="Write something for your followers">${esc(draft.text)}</textarea>
${draft.img ? `<div class="bz-prev"><img src="${draft.img}"><button class="bz-ic" data-act="img-clear" title="Remove image"><i class="fa-solid fa-xmark"></i></button></div>` : ''}
<input id="bz-pdesc" placeholder="Image description (optional, for models that can't see images)" value="${esc(draft.desc)}">
<div class="bz-row"><label class="bz-btn ghost"><i class="fa-solid fa-image"></i> Add image<input type="file" accept="image/*" hidden data-img="post"></label>
<select id="bz-paud"><option value="pub">Everyone</option><option value="subs">Subscribers only</option></select><button class="bz-btn" data-act="post-add">Publish</button></div></div>
${posts || '<div class="bz-empty">No posts yet. Your community page is waiting.</div>'}`;
}
function vStream() {
    const c = C(), st = c.st; if (!st) return vStart(c); const g = GRADES[S().popularity];
    return `<div class="bz-livegrid"><div class="bz-colL"><section class="bz-card bz-stage"><div class="bz-banner sm" style="${c.p.thumb ? `background-image:url('${c.p.thumb}')` : ''}"><span class="bz-livepill"><i></i> LIVE</span>${st.priv ? `<span class="bz-chip lock"><i class="fa-solid fa-lock"></i> ${st.priv.kind === 'patron' ? 'Patron: ' + esc(st.priv.patron) : esc(TIERS[st.priv.tier]) + '+'}</span>` : ''}</div>
<h2>${esc(st.title)}</h2><div class="bz-meta"><span>Uptime <b id="bz-uptime" title="Story time, read from the chat">${fmtMin(uptimeMin())}</b></span><span>${g.n} level</span><span>${fmt(c.subs)} subscribers</span></div>
<div class="bz-row"><label class="bz-inl">Viewers <input id="bz-viewers" type="number" min="0" data-live="viewers" value="${st.viewers}"></label><label class="bz-chk sm"><input type="checkbox" data-live="auto" ${st.auto ? 'checked' : ''}><span>Auto drift</span></label></div>
<div class="bz-row"><button class="bz-btn ghost" data-act="gen"><i class="fa-solid fa-comments"></i> Generate chat now</button><button class="bz-btn danger" data-act="stop"><i class="fa-solid fa-stop"></i> Stop stream</button></div></section>
<section class="bz-card"><h3>Goal</h3><div class="bz-meter"><div id="bz-fill"></div><span id="bz-mtxt"></span></div><div class="bz-grid2"><input data-live="goal-label" value="${esc(st.goal.label)}" placeholder="Goal name"><input data-live="goal-target" type="number" min="0" value="${st.goal.target}"></div><button class="bz-link" data-act="goal-reset">Reset progress</button></section>
<section class="bz-card"><h3>Tip jar</h3><div class="bz-tips">${PRESETS.map(p => `<button class="bz-tip" data-act="tip" data-a="${p.a}"><i class="fa-solid ${p.i}"></i><b>${p.n}</b><span>${p.a}</span></button>`).join('')}</div>
<div class="bz-row"><input id="bz-tipper" placeholder="Tipper name" value="${esc(ctx().name1 || '')}"><input id="bz-custom" type="number" min="1" placeholder="Custom"><button class="bz-btn ghost" data-act="tip-custom">Tip</button></div><p class="bz-note">Simulates a viewer tip. Tokens go to your wallet.</p></section>
<section class="bz-card"><h3>Moderation</h3><div id="bz-mod"></div></section></div>
<div class="bz-colR"><section class="bz-card bz-chatc"><h3>Live chat <span class="bz-typing">viewers are typing…</span></h3><div id="bz-feed"></div></section>
<section class="bz-card"><h3>Donations</h3><div id="bz-don"></div></section><section class="bz-card"><h3>Requests</h3><div id="bz-req"></div></section></div></div>`;
}
function vStart(c) {
    const p = c.p, ok = p.consent18 && p.consentExplicit, pats = c.cast.filter(m => m.role === 'patron');
    return `<div class="bz-card bz-start"><h2>Go live</h2>${ok ? '' : '<div class="bz-warn">Tick both consent boxes in the Channel tab to unlock streaming.</div>'}
<label>Stream title<input id="bz-f-title" placeholder="Tonight on BuzzCam"></label>
<div class="bz-grid2"><label>Goal<input id="bz-f-goal" placeholder="New toy fund"></label><label>Goal amount (tokens)<input id="bz-f-target" type="number" min="0" value="1000"></label></div>
<label>Show type<select id="bz-f-mode"><option value="pub">Public stream</option><option value="tier">Private show for subscribers</option><option value="patron">Private show for one patron</option></select></label>
<label id="bz-tierbox" hidden>Minimum tier<select id="bz-f-tier">${[1, 2, 3].map(i => `<option value="${i}">${TIERS[i]}${i < 3 ? ' and above' : ''}</option>`).join('')}</select></label>
<label id="bz-patbox" hidden>Patron<input id="bz-f-pat" list="bz-pats" placeholder="Name"><datalist id="bz-pats">${pats.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist></label>
<button class="bz-btn big" data-act="start" ${ok ? '' : 'disabled'}><i class="fa-solid fa-play"></i> Start stream</button>
<p class="bz-note">Viewers only see messages posted after you start, and only while you are live. Wrap off-camera text in ((double parentheses)) or &lt;offcam&gt;…&lt;/offcam&gt; to keep it from them.</p></div>`;
}
function vHistory() {
    const c = C();
    return c.hist.length ? c.hist.map(h => `<article class="bz-card"><div class="bz-ph"><b>${esc(h.title)}</b>${h.priv ? `<span class="bz-chip lock"><i class="fa-solid fa-lock"></i> ${esc(h.priv)}</span>` : ''}<time>${new Date(h.start).toLocaleString()}</time><button class="bz-ic" data-act="hist-del" data-id="${h.id}" title="Delete"><i class="fa-solid fa-trash"></i></button></div>
<div class="bz-meta"><span>${fmtMin(h.mins ?? Math.round((h.end - h.start) / 60000))} long</span><span>Peak ${fmt(h.peak)} viewers</span><span>${fmt(h.earned)} tokens from ${h.tips} tips</span><span>+${h.gained} subscribers</span></div>
${h.summary ? `<p class="bz-sum">${esc(h.summary)}</p>` : '<p class="bz-note">No summary yet.</p>'}
<div class="bz-row"><button class="bz-btn ghost" data-act="hist-sum" data-id="${h.id}" ${h.busy ? 'disabled' : ''}>${h.busy ? 'Summarizing…' : h.summary ? 'Summarize again' : 'Summarize'}</button><button class="bz-link" data-act="hist-log" data-id="${h.id}">${h.show ? 'Hide' : 'Show'} on-camera log</button></div>
${h.show ? `<div class="bz-log">${h.log.map(l => `<p><b>${esc(l[0])}</b> ${esc(l[1])}</p>`).join('')}</div>` : ''}</article>`).join('') : '<div class="bz-empty">Finished streams show up here.</div>';
}
function vCast() {
    const c = C();
    return `<div class="bz-row"><button class="bz-btn" data-act="cast-add"><i class="fa-solid fa-plus"></i> Add person</button><button class="bz-btn ghost" data-act="cast-import"><i class="fa-solid fa-user-group"></i> Import group characters</button></div>
<p class="bz-note">Co-hosts and moderators are usually other characters in a group chat. Viewers outside this list can still chat, tip and request.</p>
${c.cast.map(m => { const pr = m.perms || ROLES[m.role]; return `<article class="bz-card bz-member"><div class="bz-grid2"><input data-cm="name" data-id="${m.id}" value="${esc(m.name)}" placeholder="Name"><select data-cm="role" data-id="${m.id}">${Object.keys(ROLES).map(r => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
${m.role === 'subscriber' || m.role === 'patron' ? `<label class="bz-inl">Tier <select data-cm="tier" data-id="${m.id}">${[1, 2, 3].map(i => `<option value="${i}" ${(m.tier || 1) === i ? 'selected' : ''}>${TIERS[i]}</option>`).join('')}</select></label>` : ''}
<textarea data-cm="persona" data-id="${m.id}" rows="2" placeholder="Personality and chat style">${esc(m.persona)}</textarea>
<div class="bz-row">${['tip', 'request', 'moderate'].map(k => `<label class="bz-chk sm"><input type="checkbox" data-cm="perm_${k}" data-id="${m.id}" ${pr[k] ? 'checked' : ''}><span>Can ${k}</span></label>`).join('')}<button class="bz-ic" data-act="cast-del" data-id="${m.id}" title="Remove"><i class="fa-solid fa-trash"></i></button></div></article>`; }).join('') || '<div class="bz-empty">No cast yet. Add a co-host, a moderator or a few regulars.</div>'}`;
}
function vSettings() {
    const s = S(), ps = profiles(), opt = sel => `<option value="">Current connection</option>` + ps.map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    const sel = (k, l, o) => `<label>${l}<select data-set="${k}">${o.map(([v, n]) => `<option value="${v}" ${s[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    const tg = (k, t) => `<label class="bz-chk"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}><span>${t}</span></label>`;
    return `<div class="bz-cols"><div class="bz-card"><h3>Models</h3><label>Viewer chat profile<select data-set="profileId">${opt(s.profileId)}</select></label><label>Stream summary profile<select data-set="summaryProfileId">${opt(s.summaryProfileId)}</select></label>${ps.length ? '' : '<p class="bz-note">No connection profiles found. BuzzCam will use your current connection.</p>'}
<h3>Popularity</h3><div class="bz-seg">${GRADES.map((g, i) => `<button data-act="pop" data-n="${i}" class="${s.popularity === i ? 'on' : ''}"><b>${g.n}</b><span>${fmt(g.v[0])} to ${fmt(g.v[1])} viewers</span></button>`).join('')}</div>
<p class="bz-note">Sets viewer and subscriber counts, chat speed and tip size.</p></div>
<div class="bz-card"><h3>Honey Tokens</h3><div class="bz-grid2"><label>Money per token<input type="number" step="0.001" min="0" data-set="rate" value="${s.rate}"></label><label>Currency${s.phoneLink && phoneCurrency() ? ' (from phone)' : ''}<input data-set="currency" value="${esc(curCode())}" ${s.phoneLink && phoneCurrency() ? 'disabled' : ''}></label></div>
${tg('phoneLink', 'Link with Phone-ST bank')}<div class="bz-row"><button class="bz-btn ghost" data-act="phone-test">Test phone link</button></div><div id="bz-ptest" class="bz-note"></div>
<h3>Behaviour</h3>${sel('streamerWho', 'Who is the streamer', [['char', 'The character (bot)'], ['user', 'The user'], ['both', 'Both']])}<p class="bz-note">Only the streamer's messages are on camera. Choose Both to show everyone in the chat.</p>${sel('chatMode', 'Viewer chat generation', [['auto', 'Automatic after each message'], ['manual', 'Manual (button in the stream room)']])}${sel('commentMode', 'Post comments generation', [['auto', 'Automatic when a post is published'], ['manual', 'Manual (button on each post)']])}${tg('botMods', 'Bot moderators can mute and ban')}${tg('inject', 'Let the character see chat, tips and accepted requests')}${tg('echo', 'Post tips into the main chat as system messages')}${tg('floatBtn', 'Show floating button')}
<label>Story minutes per message (used if no clock is found in chat)<input type="number" min="1" max="240" data-set="minPerMsg" value="${s.minPerMsg}"></label><label>Max events per round<input type="number" min="1" max="12" data-set="maxEvents" value="${s.maxEvents}"></label><button class="bz-link" data-act="fab-reset">Reset floating button position</button></div></div>`;
}
const feedRow = f => {
    const staff = f.role === 'mod' || f.role === 'cohost';
    if (f.t === 'chat') return `<div class="bz-m"><span class="bz-u r-${f.role}">${ROLEI[f.role] ? `<i class="fa-solid ${ROLEI[f.role]}"></i> ` : ''}${esc(f.who)}</span> ${esc(f.text)}${staff ? '' : `<span class="bz-mb"><button data-act="mute" data-w="${esc(f.who)}" title="Mute"><i class="fa-solid fa-volume-xmark"></i></button><button data-act="ban" data-w="${esc(f.who)}" title="Ban"><i class="fa-solid fa-ban"></i></button></span>`}</div>`;
    if (f.t === 'tip') return `<div class="bz-m bz-tipm"><i class="fa-solid fa-droplet"></i> <b>${esc(f.who)}</b> tipped <b>${fmt(f.amt)}</b> tokens${f.text ? ` <em>${esc(f.text)}</em>` : ''}</div>`;
    if (f.t === 'req') return `<div class="bz-m bz-reqm"><i class="fa-solid fa-hand"></i> <b>${esc(f.who)}</b> ${esc(f.text)}</div>`;
    return `<div class="bz-m bz-sysm">${esc(f.text)}</div>`;
};
const donHtml = st => st.don.slice(-12).reverse().map(d => `<div class="bz-q ${d.state === 'read' ? 'dim' : ''}"><div><b>${esc(d.name)}</b> ${fmt(d.amt)} tokens${d.msg ? `<br><em>${esc(d.msg)}</em>` : ''}</div>${d.state === 'read' ? '' : `<button class="bz-btn sm ghost" data-act="don-read" data-id="${d.id}">Read</button>`}</div>`).join('') || '<p class="bz-note">No donations yet.</p>';
const reqHtml = st => st.req.filter(r => r.status === 'pending' || r.status === 'accepted').map(r => `<div class="bz-q"><div><b>${esc(r.name)}</b>${r.price ? ` · ${r.price} tokens` : ''}<br>${esc(r.text)}${r.status === 'accepted' ? ' <span class="bz-chip">accepted</span>' : ''}${r.decl ? `<input id="bz-rr-${r.id}" placeholder="Reason (optional)">` : ''}</div><div class="bz-qb">${r.status === 'accepted' ? `<button class="bz-btn sm" data-act="req-done" data-id="${r.id}">Done</button>` : r.decl ? `<button class="bz-btn sm danger" data-act="req-confirm" data-id="${r.id}">Decline</button><button class="bz-btn sm ghost" data-act="req-cancel" data-id="${r.id}">Back</button>` : `<button class="bz-btn sm" data-act="req-accept" data-id="${r.id}">Accept</button><button class="bz-btn sm ghost" data-act="req-decline" data-id="${r.id}">Decline</button>`}</div></div>`).join('') || '<p class="bz-note">No open requests.</p>';
const modHtml = st => `${st.muted.concat(st.banned).length ? '' : '<p class="bz-note">Use the mute and ban icons next to chat messages.</p>'}${st.muted.map(n => `<div class="bz-q"><span>Muted: ${esc(n)}</span><button class="bz-link" data-act="unmod" data-l="muted" data-w="${esc(n)}">Undo</button></div>`).join('')}${st.banned.map(n => `<div class="bz-q"><span>Banned: ${esc(n)}</span><button class="bz-link" data-act="unmod" data-l="banned" data-w="${esc(n)}">Undo</button></div>`).join('')}<p class="bz-note">Bot moderators: ${S().botMods ? 'on' : 'off'}</p>`;

/* ---------- rendering ---------- */
function view() {
    const m = $q('#bz-main'); if (!m || !isOpen) return; const c = C();
    if (!c) { m.innerHTML = '<div class="bz-empty">Open a chat to use BuzzCam. Everything is saved per chat.</div>'; return; }
    if (!c.on && tab !== 'settings') { m.innerHTML = '<div class="bz-empty"><h2>BuzzCam is off in this chat</h2><p>Nothing is captured and nothing is sent to the model.</p><button class="bz-btn" data-act="chat-on">Turn on</button></div>'; return; }
    m.innerHTML = { profile: vProfile, community: vCommunity, stream: vStream, history: vHistory, cast: vCast, settings: vSettings }[tab](); live();
}
function setIf(sel, html) { const el = $q(sel); if (el && !el.contains(document.activeElement)) el.innerHTML = html; }
function live() {
    head(); const st = C()?.st; if (!isOpen || tab !== 'stream' || !st || !$q('#bz-feed')) return;
    const fe = $q('#bz-feed'), stick = fe.scrollTop + fe.clientHeight >= fe.scrollHeight - 50;
    fe.innerHTML = st.feed.slice(-80).map(feedRow).join(''); if (stick) fe.scrollTop = fe.scrollHeight;
    setIf('#bz-don', donHtml(st)); setIf('#bz-req', reqHtml(st)); setIf('#bz-mod', modHtml(st));
    const vi = $q('#bz-viewers'); if (vi && document.activeElement !== vi) vi.value = st.viewers;
    const pct = st.goal.target > 0 ? clamp(st.goal.cur / st.goal.target * 100, 0, 100) : 0;
    $q('#bz-fill').style.width = pct + '%'; $q('#bz-mtxt').textContent = `${fmt(st.goal.cur)} / ${fmt(st.goal.target)} tokens`;
}
function head() {
    const r = $q('#bz-root'); if (!r) return; const c = C();
    $q('#bz-bal').textContent = fmt(S().wallet); r.classList.toggle('bz-is-live', !!c?.st); $q('#bz-pwr').classList.toggle('off', !c?.on);
    $q('#bz-tabs').innerHTML = TABS.map(([k, n, i]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}"><i class="fa-solid ${i}"></i> ${n}${k === 'stream' && c?.st ? '<span class="bz-dot"></span>' : ''}</button>`).join('');
    const w = $q('#bz_chat_on'); if (w) w.checked = !!c?.on;
}
function modal(html) { const m = $q('#bz-modal'); m.innerHTML = html ? `<div class="bz-box">${html}</div>` : ''; m.classList.toggle('on', !!html); }
function cashModal() {
    const s = S(); modal(`<h3>Cash out Honey Tokens</h3><p>Balance <b>${fmt(s.wallet)}</b> tokens. 1 token = ${s.rate} ${esc(curCode())}.</p><label>Tokens to convert<input type="number" id="bz-cash" min="1" max="${s.wallet}" value="${s.wallet}" data-cash></label><p id="bz-cashp" class="bz-big">${(s.wallet * s.rate).toFixed(2)} ${esc(curCode())}</p><p class="bz-note">${s.phoneLink ? 'The money is deposited into your Phone-ST bank account.' : 'Phone link is off, so the conversion is only logged. Turn the link on in Settings to deposit into the phone bank.'}</p><div class="bz-row"><button class="bz-btn" data-act="cash-ok">Convert</button><button class="bz-btn ghost" data-act="modal-x">Cancel</button></div>`);
}

/* ---------- events ---------- */
const ACT = {
    close: () => { isOpen = false; $q('#bz-root').classList.add('bz-hide'); },
    'toggle-chat': () => toggleChat(), 'chat-on': () => toggleChat(true), cashout: cashModal, 'cash-ok': cashOut, 'modal-x': () => modal(''),
    pop: t => { S().popularity = +t.dataset.n; saveS(); view(); },
    start: startStream, stop: () => { if (confirm('Stop the stream and save it to history?')) stopStream(); }, gen: () => genViewers(true),
    tip: t => tip(+t.dataset.a), 'tip-custom': () => tip(parseInt($q('#bz-custom').value) || 0),
    mute: t => { const st = C().st, n = t.dataset.w; st.muted.push(n.toLowerCase()); feed({ t: 'sys', text: `${n} was muted` }); save(); live(); },
    ban: t => { const st = C().st, n = t.dataset.w; st.banned.push(n.toLowerCase()); feed({ t: 'sys', text: `${n} was banned` }); save(); live(); },
    unmod: t => { const st = C().st, l = st[t.dataset.l]; l.splice(l.indexOf(t.dataset.w.toLowerCase()), 1); save(); live(); },
    'don-read': (t, id) => { C().st.don.find(d => d.id === id).state = 'read'; inject(); save(); live(); },
    'req-accept': (t, id) => { const r = C().st.req.find(x => x.id === id); r.status = 'accepted'; if (r.price) gain(r.name, r.price, 'Paid request: ' + r.text); feed({ t: 'sys', text: `Accepted ${r.name}'s request` }); inject(); save(); live(); },
    'req-decline': (t, id) => { C().st.req.find(x => x.id === id).decl = true; live(); },
    'req-cancel': (t, id) => { C().st.req.find(x => x.id === id).decl = false; live(); },
    'req-confirm': (t, id) => { const r = C().st.req.find(x => x.id === id); r.reason = ($q('#bz-rr-' + id)?.value || '').trim(); r.status = 'declined'; r.decl = false; feed({ t: 'sys', text: `Declined ${r.name}'s request${r.reason ? ': ' + r.reason : ''}` }); save(); live(); },
    'req-done': (t, id) => { C().st.req.find(x => x.id === id).status = 'done'; inject(); save(); live(); },
    'goal-reset': () => { const st = C().st; st.goal.cur = 0; st.goalHit = false; save(); live(); },
    'post-add': () => {
        const c = C(), text = ($q('#bz-ptext').value || '').trim(); if (!text && !draft.img) return;
        const pid = uid(); c.posts.push({ id: pid, ts: Date.now(), text, img: draft.img, desc: ($q('#bz-pdesc').value || '').trim(), subs: $q('#bz-paud').value === 'subs' }); draft = { img: '', text: '', desc: '' }; save(); view(); if (S().commentMode === 'auto') genComments(pid);
    },
    'post-com': (t, id) => genComments(id),
    'post-del': (t, id) => { const c = C(); c.posts = c.posts.filter(x => x.id !== id); save(); view(); },
    'img-clear': () => { stash(); draft.img = ''; view(); },
    'hist-sum': (t, id) => summarize(id), 'hist-del': (t, id) => { if (confirm('Delete this stream from history?')) { const c = C(); c.hist = c.hist.filter(x => x.id !== id); save(); view(); } },
    'hist-log': (t, id) => { const h = C().hist.find(x => x.id === id); h.show = !h.show; view(); },
    'cast-add': () => { C().cast.push({ id: uid(), name: 'New viewer', role: 'viewer', tier: 1, persona: '', perms: { ...ROLES.viewer } }); save(); view(); },
    'cast-del': (t, id) => { const c = C(); c.cast = c.cast.filter(x => x.id !== id); save(); view(); },
    'cast-import': () => {
        try {
            const x = ctx(), g = x.groups?.find(q => q.id == x.groupId); if (!g) return toastr.info('This is not a group chat.'); const c = C(); let n = 0;
            g.members.forEach(av => { const ch = x.characters.find(q => q.avatar === av); if (ch && !memberOf(ch.name)) { c.cast.push({ id: uid(), name: ch.name, role: 'cohost', persona: '', perms: { ...ROLES.cohost } }); n++; } });
            save(); view(); toastr.success(`Imported ${n} character(s) as co-hosts.`);
        } catch (e) { toastr.error('Import failed: ' + e.message); }
    },
    'fab-reset': () => { localStorage.removeItem('buzzcam_fab'); fab(); },
    'phone-test': () => {
        const P = phoneAPI(), keys = Object.keys(window).filter(k => /phone/i.test(k)).slice(0, 12), el = $q('#bz-ptest');
        el.textContent = P ? `Found Phone-ST object. Currency: ${phoneCurrency() || 'unknown'}. Methods: ${Object.keys(P.bank || P).slice(0, 12).join(', ') || 'none'}` : `Phone-ST API not found. Globals containing "phone": ${keys.join(', ') || 'none'}`;
    },
};
function stash() { const t = $q('#bz-ptext'); if (t) { draft.text = t.value; draft.desc = $q('#bz-pdesc')?.value || ''; } }
function onClick(e) {
    const t = e.target.closest('[data-act],[data-tab]'); if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; view(); head(); return; }
    ACT[t.dataset.act]?.(t, t.dataset.id);
}
function onField(e) {
    const t = e.target, d = t.dataset; if (t.type === 'file') return;
    const val = t.type === 'checkbox' ? t.checked : t.value, c = C();
    if (t.id === 'bz-f-mode') { $q('#bz-tierbox').hidden = val !== 'tier'; $q('#bz-patbox').hidden = val !== 'patron'; return; }
    if (d.cash !== undefined) { $q('#bz-cashp').textContent = `${((+val || 0) * S().rate).toFixed(2)} ${curCode()}`; return; }
    if (d.set) { const s = S(); s[d.set] = typeof DEF[d.set] === 'number' ? (parseFloat(val) || 0) : val; saveS(); if (d.set === 'floatBtn') fab(); if (d.set === 'inject') inject(); if (d.set === 'streamerWho') { inject(); view(); } if (d.set === 'phoneLink' || d.set === 'botMods') view(); return; }
    if (!c) return;
    if (d.p) { c.p[d.p] = val; save(); if (d.p === 'name' || d.p === 'consent18') { const h = $q('.bz-chaninfo h2'); if (d.p === 'consent18') view(); else if (h) h.firstChild.textContent = (val || defName() || 'Streamer') + ' '; } return; }
    if (d.cm) {
        const m = c.cast.find(x => x.id === d.id); if (!m) return;
        if (d.cm.startsWith('perm_')) (m.perms ||= { ...ROLES[m.role] })[d.cm.slice(5)] = val ? 1 : 0;
        else if (d.cm === 'tier') m.tier = +val; else m[d.cm] = val;
        if (d.cm === 'role') { m.perms = { ...ROLES[val] }; save(); view(); return; } save(); return;
    }
    if (d.live && c.st) {
        const st = c.st; if (d.live === 'viewers') st.viewers = Math.max(0, parseInt(val) || 0); else if (d.live === 'auto') st.auto = val;
        else if (d.live === 'goal-label') st.goal.label = val; else if (d.live === 'goal-target') { st.goal.target = Math.max(0, parseInt(val) || 0); live(); } save();
    }
}
async function onChange(e) {
    const t = e.target; if (t.type !== 'file' || !t.files[0]) return; const k = t.dataset.img, c = C();
    try {
        if (k === 'post') { stash(); draft.img = await shrink(t.files[0], 900); }
        else c.p[k === 'avatar' ? 'avatar' : 'thumb'] = await shrink(t.files[0], k === 'avatar' ? 256 : 800);
        save(); view();
    } catch { toastr.error('Could not read that image.'); }
}

/* ---------- floating button, window, hooks ---------- */
function fabState() { $q('#bz-fab')?.classList.toggle('bz-live', !!C()?.st); }
function place(b) {
    let p; try { p = JSON.parse(localStorage.getItem('buzzcam_fab')); } catch { p = null; }
    const w = window.innerWidth, h = window.innerHeight; p = p || { x: w - 70, y: Math.round(h * 0.55) };
    b.style.left = clamp(p.x, 4, w - 56) + 'px'; b.style.top = clamp(p.y, 4, h - 56) + 'px';
}
function fab() {
    let b = $q('#bz-fab');
    if (!b) {
        b = document.createElement('button'); b.id = 'bz-fab'; b.type = 'button'; b.title = 'BuzzCam'; b.innerHTML = bee('f'); document.documentElement.appendChild(b);
        let sx, sy, ox, oy, moved = false, down = false;
        b.addEventListener('pointerdown', e => { down = true; moved = false; sx = e.clientX; sy = e.clientY; ox = b.offsetLeft; oy = b.offsetTop; b.setPointerCapture(e.pointerId); });
        b.addEventListener('pointermove', e => { if (!down) return; if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 8) moved = true; if (moved) { b.style.left = clamp(ox + e.clientX - sx, 4, innerWidth - 56) + 'px'; b.style.top = clamp(oy + e.clientY - sy, 4, innerHeight - 56) + 'px'; } });
        b.addEventListener('pointerup', () => { if (!down) return; down = false; if (moved) localStorage.setItem('buzzcam_fab', JSON.stringify({ x: b.offsetLeft, y: b.offsetTop })); else openWin(); });
        window.addEventListener('resize', () => place(b));
    }
    b.style.display = S().floatBtn ? '' : 'none'; place(b); fabState();
}
function openWin() { isOpen = true; $q('#bz-root').classList.remove('bz-hide'); view(); head(); }
function mount() {
    if ($q('#bz-root')) return; const r = document.createElement('div'); r.id = 'bz-root'; r.className = 'bz-hide';
    r.innerHTML = `<div class="bz-win"><header class="bz-top"><div class="bz-brand">${bee('h')}<span>BuzzCam</span><em>18+</em></div><button class="bz-wallet" data-act="cashout" title="Cash out"><i class="fa-solid fa-jar"></i><b id="bz-bal">0</b><span>Honey Tokens</span></button><button class="bz-ic" id="bz-pwr" data-act="toggle-chat" title="Turn BuzzCam on or off in this chat"><i class="fa-solid fa-power-off"></i></button><button class="bz-ic" data-act="close" title="Close"><i class="fa-solid fa-xmark"></i></button></header>
<nav id="bz-tabs" class="bz-tabs"></nav><main id="bz-main"></main><div id="bz-modal"></div></div>`;
    document.documentElement.appendChild(r); r.addEventListener('click', onClick); r.addEventListener('input', onField); r.addEventListener('change', onChange);
}
function drawer() {
    if ($q('#bz_drawer')) return; const host = $q('#extensions_settings2') || $q('#extensions_settings'); if (!host) return;
    const d = document.createElement('div'); d.id = 'bz_drawer';
    d.innerHTML = `<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>BuzzCam</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><div class="flex-container"><input id="bz_open" class="menu_button" type="button" value="Open BuzzCam"><label class="checkbox_label"><input type="checkbox" id="bz_chat_on"><span>Enabled in this chat</span></label></div></div></div>`;
    host.appendChild(d); $q('#bz_open').addEventListener('click', openWin); $q('#bz_chat_on').addEventListener('change', e => toggleChat(e.target.checked));
}
function wand() {
    if ($q('#bz-wand')) return; const m = document.getElementById('extensionsMenu'); if (!m) { setTimeout(wand, 1500); return; }
    const d = document.createElement('div'); d.id = 'bz-wand'; d.className = 'list-group-item flex-container flexGap5'; d.innerHTML = '<div class="fa-solid fa-video extensionsMenuExtensionButton"></div>BuzzCam'; d.addEventListener('click', openWin); m.appendChild(d);
}
function slash() { try { const x = ctx(); x.SlashCommandParser.addCommandObject(x.SlashCommand.fromProps({ name: 'buzzcam', callback: () => { openWin(); return ''; }, helpString: 'Open BuzzCam' })); } catch (e) { console.warn('[BuzzCam] slash command unavailable', e); } }
function hooks() {
    const x = ctx(), E = x.eventSource, T = x.event_types;
    E.on(T.MESSAGE_RECEIVED, (id, type) => {
        const st = C()?.st; if (st) { st.don.forEach(d => { if (d.state === 'sent') d.state = 'read'; }); }
        if (capture(id) && type !== 'swipe' && S().chatMode === 'auto') setTimeout(genViewers, 1500); inject(); live();
    });
    E.on(T.MESSAGE_SENT, id => capture(id));
    E.on(T.GENERATION_STARTED, (type, p, dry) => { if (dry || type === 'quiet') return; stGen = true; C()?.st?.don.forEach(d => { if (d.state === 'new') d.state = 'sent'; }); inject(); });
    [T.GENERATION_ENDED, T.GENERATION_STOPPED].forEach(ev => { if (ev) E.on(ev, () => { stGen = false; }); });
    E.on(T.CHAT_CHANGED, () => { C()?.hist.forEach(h => { h.busy = 0; }); C()?.posts.forEach(x => { x.busy = 0; }); draft = { img: '', text: '', desc: '' }; busy = false; stGen = false; inject(); fabState(); view(); head(); });
}

jQuery(() => {
    initSettings(); mount(); fab(); drawer(); wand(); slash(); hooks(); inject(); head();
    setInterval(() => { const el = $q('#bz-uptime'); if (!el || !C()?.st) return; tickClock(); el.textContent = fmtMin(uptimeMin()); el.title = C().st.clk ? 'Story time, read from the chat' : 'Estimated from message count (no clock found in chat)'; }, 2000);
});
