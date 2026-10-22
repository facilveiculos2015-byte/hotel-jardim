/* Hotel Jardim — Chat (1:1 e grupos, Supabase Realtime, texto + foto, não lidas, som). Adaptado do Chat Minera. */
(function () {
'use strict';
let X, st = { perfis: [], conversas: [], parts: [], msgs: [] }, aberta = null, ch = null;
const L = { get: k => { try { return JSON.parse(localStorage.getItem('hj_demo_chat_' + k) || '[]'); } catch (e) { return []; } }, put: (k, v) => localStorage.setItem('hj_demo_chat_' + k, JSON.stringify(v)) };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random());
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .35); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .35); } catch (e) {} }
const nome = id => { const p = st.perfis.find(x => x.id === id); return p ? (p.nome || p.email) : 'Usuário'; };
const myPart = c => st.parts.find(p => p.conversa_id === c && p.user_id === X.me.id);
function unreadOf(c) { const p = myPart(c), t = p ? p.lido_em : '1970'; return st.msgs.filter(m => m.conversa_id === c && m.autor !== X.me.id && m.created_at > t).length; }
function titulo(c) { if (c.titulo) return c.titulo; const o = st.parts.filter(p => p.conversa_id === c.id && p.user_id !== X.me.id).map(p => nome(p.user_id)); return o.join(', ') || 'Conversa'; }

const API = {
  async load() {
    if (X.DEMO) { st.perfis = L.get('perfis'); if (!st.perfis.length) { st.perfis = [{ id: X.me.id, nome: 'Jhon', papel: 'dono' }, { id: 'u-maria', nome: 'Maria (camareira)', papel: 'camareira' }, { id: 'u-jose', nome: 'José (recepção)', papel: 'equipe' }]; L.put('perfis', st.perfis); }
      st.conversas = L.get('conversas'); st.parts = L.get('parts'); st.msgs = L.get('msgs'); return; }
    const sb = X.sb; const [p, c, pa, m] = await Promise.all([sb.from('hj_perfis').select('*'), sb.from('hj_conversas').select('*').order('created_at'), sb.from('hj_participantes').select('*'),
      sb.from('hj_mensagens').select('*').order('created_at', { ascending: false }).limit(800)]);
    st.perfis = p.data || []; st.conversas = c.data || []; st.parts = pa.data || []; st.msgs = (m.data || []).reverse();
  },
  async nova(membros, tit) {
    if (X.DEMO) { const id = uid(); st.conversas.push({ id, owner: X.me.id, titulo: tit || null, grupo: membros.length > 1, created_at: new Date().toISOString() });
      [X.me.id].concat(membros).forEach(u => st.parts.push({ conversa_id: id, user_id: u, lido_em: new Date().toISOString() })); L.put('conversas', st.conversas); L.put('parts', st.parts); return id; }
    const r = await X.sb.rpc('hj_nova_conversa', { p_membros: membros, p_titulo: tit || null }); if (r.error) throw r.error; await API.load(); return r.data;
  },
  async enviar(c, texto, foto) {
    const m = { conversa_id: c, autor: X.me.id, texto: texto || null, foto: foto || null };
    if (X.DEMO) { Object.assign(m, { id: uid(), created_at: new Date().toISOString() }); st.msgs.push(m); L.put('msgs', st.msgs);
      setTimeout(() => { const o = st.parts.find(p => p.conversa_id === c && p.user_id !== X.me.id); if (!o) return; receive({ id: uid(), conversa_id: c, autor: o.user_id, texto: 'Ok, recebido! 👍', created_at: new Date().toISOString() }); }, 1500); return; }
    const r = await X.sb.from('hj_mensagens').insert(m).select().single(); if (r.error) throw r.error; if (!st.msgs.some(x => x.id === r.data.id)) st.msgs.push(r.data);
  },
  async lido(c) { const p = myPart(c), t = new Date().toISOString(); if (p) p.lido_em = t; if (X.DEMO) return L.put('parts', st.parts);
    await X.sb.from('hj_participantes').update({ lido_em: t }).eq('conversa_id', c).eq('user_id', X.me.id); },
  async apagarMsg(m) { st.msgs = st.msgs.filter(x => x.id !== m.id); if (X.DEMO) return L.put('msgs', st.msgs); const r = await X.sb.from('hj_mensagens').delete().eq('id', m.id); if (r.error) throw r.error; },
  async apagarConversa(c) { st.conversas = st.conversas.filter(x => x.id !== c.id); st.msgs = st.msgs.filter(m => m.conversa_id !== c.id); st.parts = st.parts.filter(p => p.conversa_id !== c.id);
    if (X.DEMO) { L.put('conversas', st.conversas); L.put('msgs', st.msgs); L.put('parts', st.parts); return; } const r = await X.sb.from('hj_conversas').delete().eq('id', c.id); if (r.error) throw r.error; },
  async renomear(c, t) { c.titulo = t; if (X.DEMO) return L.put('conversas', st.conversas); const r = await X.sb.from('hj_conversas').update({ titulo: t }).eq('id', c.id); if (r.error) throw r.error; }
};
function receive(m) {
  if (st.msgs.some(x => x.id === m.id)) return; st.msgs.push(m); if (X.DEMO) L.put('msgs', st.msgs);
  if (m.autor !== X.me.id) { beep(); if (document.hidden && 'Notification' in window && Notification.permission === 'granted') try { new Notification('💬 ' + nome(m.autor), { body: m.texto || '📷 Foto', tag: 'chat-' + m.conversa_id }); } catch (e) {} }
  if (aberta === m.conversa_id && document.querySelector('.bubbles')) API.lido(aberta).then(() => 0);
  X.render(); if (aberta === m.conversa_id) scrollEnd();
}
function scrollEnd() { setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 30); }
function realtime() {
  if (X.DEMO || ch) return;
  ch = X.sb.channel('hj-chat-' + X.me.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hj_mensagens' }, p => {
    if (!st.conversas.some(c => c.id === p.new.conversa_id)) API.load().then(() => receive(p.new)); else receive(p.new); })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'hj_mensagens' }, p => { st.msgs = st.msgs.filter(m => m.id !== p.old.id); X.render(); })
    .subscribe();
}
const esc = s => X.esc(s);
function lista() {
  const cs = [...st.conversas].map(c => ({ c, last: st.msgs.filter(m => m.conversa_id === c.id).slice(-1)[0] })).sort((a, b) => ((b.last || b.c).created_at).localeCompare((a.last || a.c).created_at));
  return `<h1>Chat</h1><p class="muted">Conversas com sua equipe e clientes.</p><div class="chat-list">` + (cs.map(({ c, last }) => { const n = unreadOf(c.id);
    return `<div class="card item" data-a="${X.h(() => abrir(c.id))}" role="button" tabindex="0"><div class="row"><h3>${c.grupo ? '👥' : '💬'} ${esc(titulo(c))}</h3>${n ? `<span class="pill st-atrasada">${n} nova(s)</span>` : ''}</div>
    <div class="meta">${last ? esc((last.autor === X.me.id ? 'Você: ' : nome(last.autor) + ': ') + (last.texto || '📷 Foto')).slice(0, 80) : 'Sem mensagens'}</div></div>`; }).join('') || '<div class="empty">Nenhuma conversa ainda.</div>') +
    `</div><button class="btn primary fab" data-a="${X.h(novaConversa)}">+ Conversa</button>`;
}
function conversa() {
  const c = st.conversas.find(x => x.id === aberta); if (!c) { aberta = null; return lista(); }
  const ms = st.msgs.filter(m => m.conversa_id === c.id);
  return `<div class="row"><button class="btn sm ghost" data-a="${X.h(() => { aberta = null; X.render(); })}">← Voltar</button><h3 style="flex:1">${c.grupo ? '👥' : '💬'} ${esc(titulo(c))}</h3>
    ${c.owner === X.me.id ? `<button class="btn sm ghost" data-a="${X.h(async () => { const t = prompt('Nome da conversa', c.titulo || ''); if (t != null) { await API.renomear(c, t.trim() || null); X.render(); } })}" aria-label="Renomear">✏️</button><button class="btn sm danger" data-a="${X.h(async () => { if (confirm('Excluir esta conversa e todas as mensagens?')) { await API.apagarConversa(c).catch(e => X.toast(e.message)); aberta = null; X.render(); } })}" aria-label="Excluir conversa">🗑</button>` : ''}</div>
  <div class="bubbles" style="margin-top:10px">${ms.map(m => `<div class="bub ${m.autor === X.me.id ? 'mine' : ''}">${c.grupo && m.autor !== X.me.id ? `<b style="font-size:13px">${esc(nome(m.autor))}</b><br>` : ''}${m.foto ? `<img src="${esc(m.foto)}" alt="Foto enviada">` : ''}${m.texto ? esc(m.texto) : ''}
    <small>${new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${m.autor === X.me.id ? ` · <a href="#" data-a="${X.h(async () => { if (confirm('Apagar esta mensagem?')) { await API.apagarMsg(m).catch(e => X.toast(e.message)); X.render(); } })}">apagar</a>` : ''}</small></div>`).join('') || '<div class="empty">Diga olá 👋</div>'}</div>
  <form class="composer" id="composer"><label class="btn" style="margin:0;display:flex;align-items:center" aria-label="Enviar foto">📷<input type="file" accept="image/*" id="chatFoto" hidden></label>
  <input type="text" id="chatTxt" placeholder="Mensagem" aria-label="Mensagem" autocomplete="off" maxlength="4000"><button class="btn primary" type="submit">Enviar</button></form>`;
}
async function abrir(id) { aberta = id; await API.lido(id).catch(() => 0); X.render(); scrollEnd(); }
async function novaConversa() {
  const outros = st.perfis.filter(p => p.id !== X.me.id);
  if (!outros.length) { X.toast(X.perfil && X.perfil.papel === 'dono' ? 'Convide pessoas em Início › Equipe primeiro' : 'Ninguém disponível ainda'); return; }
  const d = document.getElementById('dlg'); document.getElementById('dlgTitle').textContent = 'Nova conversa';
  document.getElementById('dlgBody').innerHTML = '<p class="muted">Escolha 1 pessoa (conversa individual) ou várias (grupo).</p>' + outros.map(p => `<label><input type="checkbox" name="m" value="${esc(p.id)}">${esc(p.nome || p.email)} <span class="muted">(${esc(p.papel)})</span></label>`).join('') + '<label>Nome do grupo (opcional)<input name="tit" maxlength="80"></label>';
  const f = document.getElementById('dlgForm');
  const res = await new Promise(ok => { const sub = e => { e.preventDefault(); const ms = [...f.querySelectorAll('input[name=m]:checked')].map(i => i.value); if (!ms.length) { X.toast('Escolha ao menos 1 pessoa'); return; } fin({ ms, tit: f.tit.value.trim() }); };
    const fin = v => { f.removeEventListener('submit', sub); d.close(); ok(v); }; f.addEventListener('submit', sub); document.getElementById('dlgCancel').onclick = () => fin(null); d.showModal(); });
  if (!res) return;
  if (res.ms.length === 1 && !res.tit) { const ex = st.conversas.find(c => !c.grupo && st.parts.some(p => p.conversa_id === c.id && p.user_id === res.ms[0])); if (ex) return abrir(ex.id); }
  try { abrir(await API.nova(res.ms, res.tit)); } catch (e) { X.toast('Erro: ' + e.message); }
}
document.addEventListener('submit', async e => { if (e.target.id !== 'composer') return; e.preventDefault(); const i = document.getElementById('chatTxt'), t = i.value.trim(); if (!t) return; i.value = '';
  try { await API.enviar(aberta, t); X.render(); scrollEnd(); document.getElementById('chatTxt').focus(); } catch (err) { X.toast('Erro: ' + err.message); i.value = t; } });
document.addEventListener('change', async e => { if (e.target.id !== 'chatFoto' || !e.target.files[0]) return; try { const f = await X.compress(e.target.files[0], 1000); await API.enviar(aberta, null, f); X.render(); scrollEnd(); } catch (err) { X.toast('Erro: ' + err.message); } });
window.HJChat = {
  async start(ctx) { X = ctx; try { await API.load(); realtime(); } catch (e) { console.warn('chat', e); } setInterval(() => !X.DEMO && API.load().then(() => 0).catch(() => 0), 120000); },
  view() { return aberta ? conversa() : lista(); },
  unread() { return X ? st.conversas.reduce((a, c) => a + unreadOf(c.id), 0) : 0; },
  _st: st, _API: API
};
})();
