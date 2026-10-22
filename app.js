/* Hotel Jardim — app */
(function () {
'use strict';
const C = window.HJCalc, CFG = window.HJ_CONFIG || {};
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dt = s => s ? C.parse(s).toLocaleDateString('pt-BR') : '—';
const hoje = () => C.iso(new Date());
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const ST = { disponivel: 'Disponível', ocupado: 'Ocupado', limpeza: 'Limpeza', manutencao: 'Manutenção', pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída',
  ativa: 'Hospedado', finalizada: 'Finalizada', paga: 'Paga', atrasada: 'Atrasada', hoje: 'Vence hoje', breve: 'Vence em breve', aberta: 'Em aberto' };
const pill = s => `<span class="pill st-${s}">${ST[s] || s}</span>`;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }

/* ================= BACKEND ================= */
const DEMO = !CFG.url || /[?&]demo=1/.test(location.search);
const TABLES = ['hj_quartos', 'hj_hospedagens', 'hj_camareiras', 'hj_limpezas', 'hj_despesas', 'hj_clientes', 'hj_emprestimos', 'hj_parcelas', 'hj_pagamentos', 'hj_eventos', 'hj_convites'];
let sb = null, me = null, perfil = null;
const Local = {
  k: t => 'hj_demo_' + t,
  get(t) { try { return JSON.parse(localStorage.getItem(this.k(t)) || '[]'); } catch (e) { return []; } },
  put(t, rows) { localStorage.setItem(this.k(t), JSON.stringify(rows)); }
};
const DB = {
  async list(t) { if (DEMO) return Local.get(t); const r = await sb.from(t).select('*').order('created_at'); if (r.error) throw r.error; return r.data; },
  async ins(t, row) { if (DEMO) { const rows = Local.get(t); const n = Object.assign({ id: uid(), owner: me.id, created_at: new Date().toISOString() }, row); rows.push(n); Local.put(t, rows); return n; }
    const r = await sb.from(t).insert(row).select().single(); if (r.error) throw r.error; return r.data; },
  async insMany(t, rows) { if (DEMO) { for (const x of rows) await this.ins(t, x); return; } const r = await sb.from(t).insert(rows); if (r.error) throw r.error; },
  async upd(t, id, p) { if (DEMO) { const rows = Local.get(t); const i = rows.findIndex(x => x.id === id); if (i >= 0) Object.assign(rows[i], p); Local.put(t, rows); return rows[i]; }
    const r = await sb.from(t).update(p).eq('id', id).select().single(); if (r.error) throw r.error; return r.data; },
  async del(t, id) { if (DEMO) { Local.put(t, Local.get(t).filter(x => x.id !== id)); return; } const r = await sb.from(t).delete().eq('id', id); if (r.error) throw r.error; },
  async delWhere(t, col, v) { if (DEMO) { Local.put(t, Local.get(t).filter(x => x[col] !== v)); return; } const r = await sb.from(t).delete().eq(col, v); if (r.error) throw r.error; }
};

/* ================= ESTADO ================= */
const S = {}; let tab = 'inicio', sub = {};
async function load() { const rs = await Promise.all(TABLES.map(t => DB.list(t).catch(e => { console.warn(t, e); return []; }))); TABLES.forEach((t, i) => S[t.slice(3)] = rs[i]); }
const byId = (t, id) => (S[t] || []).find(x => x.id === id);
function sitEmp(e) { return C.situacao(S.parcelas.filter(p => p.emprestimo_id === e.id), S.pagamentos.filter(p => p.emprestimo_id === e.id)); }
function todasParcelas() { const out = []; S.emprestimos.forEach(e => { const cli = byId('clientes', e.cliente_id); sitEmp(e).parcelas.forEach(p => out.push(Object.assign(p, { emp: e, cli }))); }); return out; }

/* ================= FORM GENÉRICO ================= */
function field(f, v) {
  const val = v == null ? (f.def != null ? (typeof f.def === 'function' ? f.def() : f.def) : '') : v;
  const req = f.req ? ' required' : '', id = 'f_' + f.k;
  if (f.type === 'select') return `<label for="${id}">${f.label}<select id="${id}" name="${f.k}"${req}>${f.req ? '' : '<option value="">—</option>'}${(typeof f.opts === 'function' ? f.opts() : f.opts).map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(val) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  if (f.type === 'textarea') return `<label for="${id}">${f.label}<textarea id="${id}" name="${f.k}" rows="2">${esc(val)}</textarea></label>`;
  if (f.type === 'check') return `<label><input type="checkbox" name="${f.k}"${val ? ' checked' : ''}>${f.label}</label>`;
  if (f.type === 'photo') return `<label for="${id}">${f.label}<input id="${id}" type="file" accept="image/*" capture="environment" name="${f.k}"></label>${val ? `<p class="muted"><img class="thumb" src="${esc(val)}" alt="comprovante atual"> foto atual mantida</p>` : ''}`;
  return `<label for="${id}">${f.label}<input id="${id}" name="${f.k}" type="${f.type || 'text'}"${f.step ? ` step="${f.step}"` : ''}${f.min != null ? ` min="${f.min}"` : ''} value="${esc(val)}"${req}${f.type === 'number' ? ' inputmode="decimal"' : ''}></label>`;
}
function compress(file, max = 900) { return new Promise((ok, no) => { const r = new FileReader(); r.onerror = no; r.onload = () => { const im = new Image(); im.onerror = no; im.onload = () => { const s = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', .7)); }; im.src = r.result; }; r.readAsDataURL(file); }); }
function form(title, fields, row, extraHtml) {
  return new Promise(resolve => {
    const d = $('#dlg'); $('#dlgTitle').textContent = title;
    $('#dlgBody').innerHTML = fields.map(f => field(f, row ? row[f.k] : null)).join('') + (extraHtml || '');
    const fm = $('#dlgForm');
    const done = async ev => {
      ev.preventDefault(); if (!fm.reportValidity()) return;
      const out = {};
      for (const f of fields) { const el = fm.elements[f.k]; if (!el) continue;
        if (f.type === 'check') out[f.k] = el.checked;
        else if (f.type === 'photo') { if (el.files[0]) out[f.k] = await compress(el.files[0]); }
        else if (f.type === 'number') out[f.k] = el.value === '' ? null : Number(el.value);
        else out[f.k] = el.value === '' ? null : el.value; }
      cleanup(); d.close(); resolve(out);
    };
    const cancel = () => { cleanup(); d.close(); resolve(null); };
    const cleanup = () => { fm.removeEventListener('submit', done); $('#dlgCancel').onclick = null; d.oncancel = null; };
    fm.addEventListener('submit', done); $('#dlgCancel').onclick = cancel; d.oncancel = e => { e.preventDefault(); cancel(); };
    d.showModal(); const first = fm.querySelector('input,select,textarea'); if (first) first.focus();
    if (fields.onOpen) fields.onOpen(fm);
  });
}
const confirmDel = what => window.confirm(`Excluir ${what}? Essa ação não pode ser desfeita.`);
async function act(fn, ok) { try { await fn(); await load(); render(); if (ok) toast(ok); } catch (e) { console.error(e); toast('Erro: ' + (e.message || e)); } }

/* ================= ESQUEMAS ================= */
const tipoQ = [['Solteiro', 'Solteiro'], ['Casal', 'Casal'], ['Duplo', 'Duplo'], ['Triplo', 'Triplo'], ['Família', 'Família'], ['Suíte', 'Suíte']];
const F = {
  quarto: [{ k: 'numero', label: 'Número do quarto', req: 1 }, { k: 'tipo', label: 'Tipo', type: 'select', opts: tipoQ, req: 1 },
    { k: 'capacidade', label: 'Capacidade (pessoas)', type: 'number', min: 1, def: 2, req: 1 }, { k: 'diaria', label: 'Diária (R$)', type: 'number', step: '0.01', min: 0, req: 1 },
    { k: 'status', label: 'Status', type: 'select', req: 1, def: 'disponivel', opts: C.STATUS.map(s => [s, ST[s]]) }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  hosp: () => [{ k: 'quarto_id', label: 'Quarto', type: 'select', req: 1, opts: () => S.quartos.map(q => [q.id, `Quarto ${q.numero} · ${q.tipo || ''} · ${brl(q.diaria)}`]) },
    { k: 'hospede', label: 'Hóspede', req: 1 }, { k: 'telefone', label: 'Telefone', type: 'tel' }, { k: 'documento', label: 'Documento (CPF/RG)' },
    { k: 'entrada', label: 'Entrada', type: 'date', req: 1, def: hoje }, { k: 'saida', label: 'Saída prevista', type: 'date', req: 1, def: () => C.iso(new Date(Date.now() + 864e5)) },
    { k: 'valor', label: 'Valor total (R$) — calculado pela diária, pode ajustar', type: 'number', step: '0.01', min: 0, req: 1 }, { k: 'pago', label: 'Já pago', type: 'check' }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  camareira: [{ k: 'nome', label: 'Nome', req: 1 }, { k: 'telefone', label: 'Telefone', type: 'tel' }, { k: 'valor_limpeza', label: 'Valor por limpeza (R$)', type: 'number', step: '0.01', min: 0, def: 0 }, { k: 'ativa', label: 'Ativa', type: 'check', def: true }],
  limpeza: () => [{ k: 'quarto_id', label: 'Quarto', type: 'select', req: 1, opts: () => S.quartos.map(q => [q.id, 'Quarto ' + q.numero + ' (' + ST[q.status] + ')']) },
    { k: 'camareira_id', label: 'Camareira', type: 'select', req: 1, opts: () => S.camareiras.filter(c => c.ativa !== false).map(c => [c.id, c.nome]) },
    { k: 'data', label: 'Data', type: 'date', def: hoje, req: 1 }, { k: 'status', label: 'Status da tarefa', type: 'select', req: 1, def: 'pendente', opts: [['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['concluida', 'Concluída']] },
    { k: 'valor', label: 'Valor a pagar (R$)', type: 'number', step: '0.01', min: 0 }, { k: 'pago', label: 'Pago à camareira', type: 'check' }, { k: 'data_pagamento', label: 'Data do pagamento', type: 'date' }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  despesa: [{ k: 'categoria', label: 'Categoria', type: 'select', req: 1, opts: ['Água', 'Luz', 'Internet', 'Lavanderia', 'Limpeza', 'Manutenção', 'Alimentação', 'Salários', 'Impostos', 'Outros'].map(x => [x, x]) },
    { k: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, req: 1 }, { k: 'data', label: 'Data', type: 'date', def: hoje, req: 1 }, { k: 'comprovante', label: 'Foto do comprovante (opcional)', type: 'photo' }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  cliente: [{ k: 'nome', label: 'Nome', req: 1 }, { k: 'telefone', label: 'Telefone / WhatsApp', type: 'tel' }, { k: 'documento', label: 'CPF / documento' }, { k: 'endereco', label: 'Endereço' }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  emprestimo: () => [{ k: 'cliente_id', label: 'Cliente', type: 'select', req: 1, opts: () => S.clientes.map(c => [c.id, c.nome]) },
    { k: 'valor', label: 'Valor emprestado (R$)', type: 'number', step: '0.01', min: 0.01, req: 1 }, { k: 'data', label: 'Data do empréstimo', type: 'date', def: hoje, req: 1 },
    { k: 'taxa', label: 'Juros (% ao mês)', type: 'number', step: '0.01', min: 0, def: 10, req: 1 }, { k: 'tipo', label: 'Tipo de juros', type: 'select', req: 1, opts: [['simples', 'Simples'], ['composto', 'Composto (Tabela Price)']] },
    { k: 'parcelas', label: 'Nº de parcelas', type: 'number', min: 1, def: 1, req: 1 }, { k: 'primeiro_vencimento', label: '1º vencimento (vazio = 1 mês depois)', type: 'date' }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  pagamento: [{ k: 'valor', label: 'Valor pago (R$)', type: 'number', step: '0.01', min: 0.01, req: 1 }, { k: 'data', label: 'Data', type: 'date', def: hoje, req: 1 }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  evento: () => [{ k: 'titulo', label: 'Compromisso', req: 1 }, { k: 'inicio', label: 'Data e hora', type: 'datetime-local', req: 1 },
    { k: 'lembrete_min', label: 'Lembrar antes', type: 'select', req: 1, def: 30, opts: [[0, 'Na hora'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes'], [1440, '1 dia antes']] },
    { k: 'cliente_id', label: 'Cliente (opcional)', type: 'select', opts: () => S.clientes.map(c => [c.id, c.nome]) }, { k: 'obs', label: 'Observação', type: 'textarea' }],
  convite: [{ k: 'nome', label: 'Nome' }, { k: 'email', label: 'E-mail', type: 'email', req: 1 }, { k: 'papel', label: 'Papel', type: 'select', req: 1, opts: [['equipe', 'Equipe'], ['camareira', 'Camareira'], ['cliente', 'Cliente (credor/devedor)']] }]
};
function withPreview(fields, fn) { fields.onOpen = fn; return fields; }

/* ================= AÇÕES ================= */
const A = {
  async quarto(row) { const v = await form(row ? 'Editar quarto' : 'Novo quarto', F.quarto, row); if (!v) return; act(() => row ? DB.upd('hj_quartos', row.id, v) : DB.ins('hj_quartos', v), 'Quarto salvo'); },
  async checkin(q, row) {
    const fs = withPreview(F.hosp(), fm => { const calc = () => { const qq = byId('quartos', fm.quarto_id.value); if (!qq || !fm.entrada.value || !fm.saida.value) return; fm.valor.value = C.estadia(fm.entrada.value, fm.saida.value, qq.diaria).valor.toFixed(2); };
      ['quarto_id', 'entrada', 'saida'].forEach(n => fm[n].addEventListener('change', calc)); if (!row) calc(); });
    const v = await form(row ? 'Editar hospedagem' : 'Check-in', fs, row || (q ? { quarto_id: q.id } : null)); if (!v) return;
    act(async () => { if (row) return DB.upd('hj_hospedagens', row.id, v);
      const qq = byId('quartos', v.quarto_id); const ns = C.nextStatus(qq.status, 'checkin');
      await DB.ins('hj_hospedagens', Object.assign(v, { status: 'ativa' })); await DB.upd('hj_quartos', qq.id, { status: ns }); }, row ? 'Hospedagem salva' : 'Check-in feito');
  },
  async checkout(h) { if (!confirm(`Fazer check-out de ${h.hospede}? O quarto vai para limpeza.`)) return;
    act(async () => { await DB.upd('hj_hospedagens', h.id, { status: 'finalizada', saida: h.saida < hoje() ? h.saida : hoje() }); const q = byId('quartos', h.quarto_id); if (q && q.status === 'ocupado') await DB.upd('hj_quartos', q.id, { status: C.nextStatus(q.status, 'checkout') }); }, 'Check-out feito'); },
  async status(q, ev) { act(() => DB.upd('hj_quartos', q.id, { status: C.nextStatus(q.status, ev) }), 'Status atualizado'); },
  async camareira(row) { const v = await form(row ? 'Editar camareira' : 'Nova camareira', F.camareira, row); if (!v) return; act(() => row ? DB.upd('hj_camareiras', row.id, v) : DB.ins('hj_camareiras', v), 'Camareira salva'); },
  async limpeza(row, q, pre) {
    const fs = withPreview(F.limpeza(), fm => { const set = () => { const c = byId('camareiras', fm.camareira_id.value); if (c && !fm.valor.value) fm.valor.value = c.valor_limpeza; }; fm.camareira_id.addEventListener('change', set); set(); });
    const v = await form(row ? 'Editar limpeza' : 'Atribuir limpeza', fs, row || pre || (q ? { quarto_id: q.id } : null)); if (!v) return;
    if (v.pago && !v.data_pagamento) v.data_pagamento = hoje();
    act(async () => { row ? await DB.upd('hj_limpezas', row.id, v) : await DB.ins('hj_limpezas', v); const qq = byId('quartos', v.quarto_id); if (v.status === 'concluida' && qq && qq.status === 'limpeza') await DB.upd('hj_quartos', qq.id, { status: 'disponivel' }); }, 'Limpeza salva');
  },
  async limpezaStatus(l, st) { act(async () => { await DB.upd('hj_limpezas', l.id, { status: st }); const q = byId('quartos', l.quarto_id); if (st === 'concluida' && q && q.status === 'limpeza') await DB.upd('hj_quartos', q.id, { status: 'disponivel' }); }, 'Tarefa atualizada'); },
  async pagarLimpeza(l) { if (!confirm(`Registrar pagamento de ${brl(l.valor)} à camareira?`)) return; act(() => DB.upd('hj_limpezas', l.id, { pago: true, data_pagamento: hoje() }), 'Pagamento registrado'); },
  async despesa(row) { const v = await form(row ? 'Editar despesa' : 'Nova despesa', F.despesa, row); if (!v) return; act(() => row ? DB.upd('hj_despesas', row.id, v) : DB.ins('hj_despesas', v), 'Despesa salva'); },
  async cliente(row) { const v = await form(row ? 'Editar cliente' : 'Novo cliente', F.cliente, row); if (!v) return; act(() => row ? DB.upd('hj_clientes', row.id, v) : DB.ins('hj_clientes', v), 'Cliente salvo'); },
  async emprestimo(row, cli) {
    if (!S.clientes.length) { toast('Cadastre um cliente primeiro'); return A.cliente(); }
    const fs = withPreview(F.emprestimo(), fm => { const p = document.createElement('p'); p.className = 'card'; p.id = 'empPrev'; fm.querySelector('#dlgBody').appendChild(p);
      const upd = () => { const l = C.loan(fm.valor.value || 0, fm.taxa.value || 0, fm.parcelas.value || 1, fm.tipo.value); p.innerHTML = `<b>${fm.parcelas.value || 1}x de ${brl(l.parcela)}</b><br><span class="muted">Total ${brl(l.total)} · Juros ${brl(l.juros)}</span>`; };
      ['valor', 'taxa', 'parcelas', 'tipo'].forEach(n => fm[n].addEventListener('input', upd)); upd(); });
    const v = await form(row ? 'Editar empréstimo' : 'Novo empréstimo', fs, row || (cli ? { cliente_id: cli.id } : null)); if (!v) return;
    if (row && S.pagamentos.some(p => p.emprestimo_id === row.id) && !confirm('As parcelas serão recalculadas (pagamentos já lançados são mantidos). Continuar?')) return;
    act(async () => { const e = row ? await DB.upd('hj_emprestimos', row.id, v) : await DB.ins('hj_emprestimos', v); if (row) await DB.delWhere('hj_parcelas', 'emprestimo_id', e.id);
      await DB.insMany('hj_parcelas', C.schedule(e).map(p => Object.assign(p, { emprestimo_id: e.id }))); }, 'Empréstimo salvo');
  },
  async pagamento(e, row) { const s = sitEmp(e); const v = await form(row ? 'Editar pagamento' : 'Registrar pagamento', F.pagamento, row || { valor: s.proxima ? s.proxima.falta : s.saldo }); if (!v) return;
    act(() => row ? DB.upd('hj_pagamentos', row.id, v) : DB.ins('hj_pagamentos', Object.assign(v, { emprestimo_id: e.id })), 'Pagamento registrado'); },
  async evento(row, pre) { const r = row ? Object.assign({}, row, { inicio: toLocalDT(row.inicio) }) : pre; const v = await form(row ? 'Editar compromisso' : 'Novo compromisso', F.evento(), r); if (!v) return;
    v.inicio = new Date(v.inicio).toISOString(); v.lembrete_min = Number(v.lembrete_min); act(() => row ? DB.upd('hj_eventos', row.id, v) : DB.ins('hj_eventos', v), 'Compromisso salvo'); },
  async convite(row) { const v = await form(row ? 'Editar convite' : 'Convidar para a equipe', F.convite, row); if (!v) return; v.email = v.email.trim().toLowerCase();
    act(() => row ? DB.upd('hj_convites', row.id, v) : DB.ins('hj_convites', v), 'Convite salvo — peça para a pessoa criar a conta com esse e-mail'); },
  async del(t, row, what, after) { if (!confirmDel(what)) return; act(async () => { await DB.del(t, row.id); if (after) await after(); }, 'Excluído'); }
};
function toLocalDT(s) { const d = new Date(s); return C.iso(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

/* ================= TELAS ================= */
const subtabs = (key, list) => { const cur = sub[key] || list[0][0]; return `<div class="tabs" role="tablist">${list.map(([k, l]) => `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? 'on' : ''}" data-sub="${key}:${k}">${l}</button>`).join('')}</div>`; };
const cur = (key, def) => sub[key] || def;
const btns = arr => `<div class="acts">${arr.filter(Boolean).map(([l, a, cls]) => `<button class="btn sm ${cls || ''}" data-a="${a}">${l}</button>`).join('')}</div>`;
const empty = m => `<div class="empty">${m}</div>`;
let H = {}; let hseq = 0; const h = fn => { const k = 'h' + (++hseq); H[k] = fn; return k; };

function vInicio() {
  const o = C.ocupacao(S.quartos), mes = hoje().slice(0, 7), r = C.resumoMes(mes, S), al = C.alertas(todasParcelas());
  const ativos = S.hospedagens.filter(x => x.status === 'ativa');
  return `<h1>Olá${perfil && perfil.nome ? ', ' + esc(perfil.nome.split(' ')[0]) : ''}!</h1><p class="muted">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
  ${alertBox(al)}
  <div class="acts"><button class="btn sm" data-a="${h(() => go('equipe'))}">👥 Equipe e convites</button><button class="btn sm" data-a="${h(() => go('chat'))}">💬 Chat</button></div>
  <h2>Ocupação</h2><div class="grid grid4">
   <div class="stat hl" data-test="disponiveis"><b>${o.disponivel}</b><small>Disponíveis</small></div><div class="stat"><b>${o.ocupado}</b><small>Ocupados</small></div>
   <div class="stat"><b>${o.limpeza}</b><small>Em limpeza</small></div><div class="stat"><b>${o.manutencao}</b><small>Manutenção</small></div></div>
  <div class="card"><div class="row"><span>Taxa de ocupação</span><b>${o.taxa}%</b></div><div class="prog"><i style="width:${o.taxa}%"></i></div></div>
  <h2>Resumo de ${new Date().toLocaleDateString('pt-BR', { month: 'long' })}</h2>${resumoCard(r)}
  <h2>Hospedados agora (${ativos.length})</h2>${ativos.map(hospCard).join('') || empty('Nenhum hóspede no momento.')}`;
}
function alertBox(al) { let s = ''; if (al.atrasadas.length) s += `<div class="alert r" data-a="${h(() => go('credito', 'devendo'))}" role="button" tabindex="0">⚠️ ${al.atrasadas.length} parcela(s) atrasada(s) — ver quem está devendo</div>`;
  if (al.hoje.length) s += `<div class="alert a">📌 ${al.hoje.length} parcela(s) vencendo hoje</div>`; if (al.breve.length) s += `<div class="alert a">⏰ ${al.breve.length} parcela(s) vencendo em até 3 dias</div>`; return s; }
function resumoCard(r) { return `<div class="card"><div class="row"><span>Receitas (hospedagens)</span><b style="color:var(--g)">${brl(r.receitas)}</b></div>
  <div class="row"><span>Despesas</span><b>− ${brl(r.despesas)}</b></div><div class="row"><span>Camareiras pagas</span><b>− ${brl(r.camareiras)}</b></div><hr style="border:0;border-top:1px solid var(--bd)">
  <div class="row"><span><b>Saldo do mês</b></span><b style="font-size:20px;color:${r.saldo < 0 ? 'var(--red)' : 'var(--g)'}">${brl(r.saldo)}</b></div></div>`; }
function quartoCard(q) {
  const hs = S.hospedagens.find(x => x.quarto_id === q.id && x.status === 'ativa');
  return `<div class="card item"><div class="row"><h3>🛏️ Quarto ${esc(q.numero)}</h3>${pill(q.status)}</div>
  <div class="meta">${esc(q.tipo || '')} · ${q.capacidade} pessoa(s) · ${brl(q.diaria)}/diária${hs ? ` · <b>${esc(hs.hospede)}</b> até ${dt(hs.saida)}` : ''}</div>
  ${btns([q.status === 'disponivel' && ['Check-in', h(() => A.checkin(q)), 'primary'], hs && ['Check-out', h(() => A.checkout(hs)), 'primary'],
    q.status === 'limpeza' && ['Atribuir limpeza', h(() => A.limpeza(null, q))], q.status === 'limpeza' && ['Marcar limpo', h(() => A.status(q, 'limpo'))],
    (q.status === 'disponivel' || q.status === 'limpeza') && ['Manutenção', h(() => A.status(q, 'manutencao'))], q.status === 'manutencao' && ['Liberar', h(() => A.status(q, 'liberar'))],
    ['Editar', h(() => A.quarto(q)), 'ghost'], ['Excluir', h(() => A.del('hj_quartos', q, 'o quarto ' + q.numero)), 'danger']])}</div>`;
}
function hospCard(x) { const q = byId('quartos', x.quarto_id); return `<div class="card item"><div class="row"><h3>${esc(x.hospede)}</h3>${pill(x.status)}</div>
  <div class="meta">Quarto ${q ? esc(q.numero) : '?'} · ${dt(x.entrada)} → ${dt(x.saida)} · ${brl(x.valor)} ${x.pago ? '✅ pago' : '⏳ a receber'}</div>
  ${btns([x.status === 'ativa' && ['Check-out', h(() => A.checkout(x)), 'primary'], !x.pago && ['Marcar pago', h(() => act(() => DB.upd('hj_hospedagens', x.id, { pago: true }), 'Recebido'))],
    ['Editar', h(() => A.checkin(null, x)), 'ghost'], ['Excluir', h(() => A.del('hj_hospedagens', x, 'a hospedagem de ' + x.hospede)), 'danger']])}</div>`; }
function vHotel() {
  const s = cur('hotel', 'quartos'); let b = subtabs('hotel', [['quartos', 'Quartos'], ['hosp', 'Hospedagens'], ['cam', 'Camareiras'], ['limp', 'Limpezas']]);
  if (s === 'quartos') { const o = C.ocupacao(S.quartos); b += `<div class="row wrap"><p class="muted"><b style="color:var(--g)">${o.disponivel}</b> de ${o.total} disponíveis</p></div>` +
    ([...S.quartos].sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'pt', { numeric: true })).map(quartoCard).join('') || empty('Cadastre seus quartos para começar.')) + fab('+ Quarto', () => A.quarto()); }
  if (s === 'hosp') b += ([...S.hospedagens].reverse().map(hospCard).join('') || empty('Nenhuma hospedagem.')) + fab('+ Check-in', () => S.quartos.length ? A.checkin() : toast('Cadastre um quarto primeiro'));
  if (s === 'cam') b += (S.camareiras.map(c => { const ls = S.limpezas.filter(l => l.camareira_id === c.id), dev = ls.filter(l => !l.pago && l.status === 'concluida').reduce((a, l) => a + Number(l.valor), 0);
    return `<div class="card item"><div class="row"><h3>🧹 ${esc(c.nome)}</h3>${c.ativa === false ? '<span class="pill st-aberta">Inativa</span>' : ''}</div><div class="meta">${esc(c.telefone || '')} · ${brl(c.valor_limpeza)}/limpeza · ${ls.length} tarefa(s) · a pagar: <b>${brl(dev)}</b></div>
    ${btns([['Atribuir limpeza', h(() => S.quartos.length ? A.limpeza(null, null, { camareira_id: c.id, valor: c.valor_limpeza }) : toast('Cadastre um quarto primeiro')), 'primary'], ['Editar', h(() => A.camareira(c)), 'ghost'], ['Excluir', h(() => A.del('hj_camareiras', c, c.nome)), 'danger']])}</div>`; }).join('') || empty('Nenhuma camareira cadastrada.')) + fab('+ Camareira', () => A.camareira());
  if (s === 'limp') b += ([...S.limpezas].reverse().map(l => { const q = byId('quartos', l.quarto_id), c = byId('camareiras', l.camareira_id);
    return `<div class="card item"><div class="row"><h3>Quarto ${q ? esc(q.numero) : '?'}</h3>${pill(l.status)}</div><div class="meta">${c ? esc(c.nome) : '—'} · ${dt(l.data)} · ${brl(l.valor)} ${l.pago ? '✅ pago ' + dt(l.data_pagamento) : '⏳ não pago'}</div>
    ${btns([l.status === 'pendente' && ['Iniciar', h(() => A.limpezaStatus(l, 'andamento'))], l.status !== 'concluida' && ['Concluir', h(() => A.limpezaStatus(l, 'concluida')), 'primary'], !l.pago && ['Pagar', h(() => A.pagarLimpeza(l))],
      ['Editar', h(() => A.limpeza(l)), 'ghost'], ['Excluir', h(() => A.del('hj_limpezas', l, 'esta tarefa de limpeza')), 'danger']])}</div>`; }).join('') || empty('Nenhuma limpeza atribuída.')) + fab('+ Limpeza', () => (S.quartos.length && S.camareiras.length) ? A.limpeza() : toast('Cadastre quartos e camareiras'));
  return b;
}
function vFin() {
  const s = cur('fin', 'resumo'); let b = subtabs('fin', [['resumo', 'Resumo do mês'], ['desp', 'Despesas'], ['rec', 'Receitas']]);
  const mes = sub.mes || hoje().slice(0, 7);
  b += `<label>Mês<input type="month" id="mesSel" value="${mes}"></label>`;
  const inMes = d => String(d || '').slice(0, 7) === mes;
  if (s === 'resumo') { const r = C.resumoMes(mes, S); const cat = {}; S.despesas.filter(d => inMes(d.data)).forEach(d => cat[d.categoria] = (cat[d.categoria] || 0) + Number(d.valor));
    b += `<h2>Resultado</h2>${resumoCard(r)}<h2>Despesas por categoria</h2><div class="card">${Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${brl(v)}</b></div><div class="prog"><i style="width:${r.despesas ? v * 100 / r.despesas : 0}%"></i></div>`).join('') || '<p class="muted">Sem despesas no mês.</p>'}</div>`; }
  if (s === 'desp') b += (S.despesas.filter(d => inMes(d.data)).sort((a, b) => b.data.localeCompare(a.data)).map(d => `<div class="card item"><div class="row"><h3>${esc(d.categoria)}</h3><b>${brl(d.valor)}</b></div>
    <div class="row"><div class="meta">${dt(d.data)}${d.obs ? ' · ' + esc(d.obs) : ''}</div>${d.comprovante ? `<a href="${esc(d.comprovante)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(d.comprovante)}" alt="Comprovante"></a>` : ''}</div>
    ${btns([['Editar', h(() => A.despesa(d)), 'ghost'], ['Excluir', h(() => A.del('hj_despesas', d, 'esta despesa')), 'danger']])}</div>`).join('') || empty('Nenhuma despesa neste mês.')) + fab('+ Despesa', () => A.despesa());
  if (s === 'rec') { const hs = S.hospedagens.filter(x => inMes(x.entrada)); b += `<div class="card row"><span>Total do mês</span><b style="color:var(--g)">${brl(hs.reduce((a, x) => a + Number(x.valor), 0))}</b></div>` + (hs.map(hospCard).join('') || empty('Sem receitas de hospedagem neste mês.')); }
  return b;
}
function empCard(e) { const s = sitEmp(e), c = byId('clientes', e.cliente_id), late = s.atrasadas.length;
  const soon = s.proxima && (s.proxima.st === 'hoje' || s.proxima.st === 'breve');
  return `<div class="card item ${late ? 'late' : soon ? 'soon' : ''}"><div class="row"><h3>${esc(c ? c.nome : '?')}</h3>${late ? pill('atrasada') : s.saldo <= 0 ? pill('paga') : s.proxima ? pill(s.proxima.st) : ''}</div>
  <div class="meta">${brl(e.valor)} em ${dt(e.data)} · ${e.taxa}% a.m. ${e.tipo} · ${e.parcelas}x</div>
  <div class="row" style="margin-top:6px"><span>Saldo devedor</span><b style="font-size:18px;color:${late ? 'var(--red)' : 'var(--tx)'}">${brl(s.saldo)}</b></div>
  <div class="prog"><i style="width:${s.total ? s.pago * 100 / s.total : 0}%"></i></div><div class="meta">Pago ${brl(s.pago)} de ${brl(s.total)}${s.proxima ? ` · próxima: ${dt(s.proxima.vencimento)} (${brl(s.proxima.falta)})` : ''}</div>
  <details><summary class="muted" style="margin-top:8px;cursor:pointer">Parcelas e pagamentos</summary>
  ${s.parcelas.map(p => `<div class="row" style="padding:4px 0"><span>${p.numero}ª · ${dt(p.vencimento)}</span><span>${brl(p.valor)} ${pill(p.st)}</span></div>`).join('')}
  ${S.pagamentos.filter(p => p.emprestimo_id === e.id).map(p => `<div class="row" style="padding:4px 0;border-top:1px dashed var(--bd)"><span>💵 ${dt(p.data)} · ${brl(p.valor)}</span><span><button class="btn sm ghost" data-a="${h(() => A.pagamento(e, p))}">Editar</button> <button class="btn sm danger" data-a="${h(() => A.del('hj_pagamentos', p, 'este pagamento'))}">Excluir</button></span></div>`).join('')}</details>
  ${btns([s.saldo > 0 && ['Registrar pagamento', h(() => A.pagamento(e)), 'primary'], c && c.telefone && ['WhatsApp', h(() => window.open('https://wa.me/55' + String(c.telefone).replace(/\D/g, '').replace(/^55/, '') + '?text=' + encodeURIComponent(`Olá ${c.nome}, lembrete: parcela de ${brl(s.proxima ? s.proxima.falta : s.saldo)} com vencimento ${s.proxima ? dt(s.proxima.vencimento) : ''}.`), '_blank'))],
    ['Editar', h(() => A.emprestimo(e)), 'ghost'], ['Excluir', h(() => A.del('hj_emprestimos', e, 'este empréstimo e suas parcelas', async () => { await DB.delWhere('hj_parcelas', 'emprestimo_id', e.id); await DB.delWhere('hj_pagamentos', 'emprestimo_id', e.id); })), 'danger']])}</div>`; }
function vCred() {
  const s = cur('cred', 'devendo'); let b = subtabs('cred', [['devendo', 'Quem está devendo'], ['emp', 'Empréstimos'], ['cli', 'Clientes']]);
  const al = C.alertas(todasParcelas()); b += alertBox(al);
  if (s === 'devendo') { const list = S.emprestimos.map(e => ({ e, s: sitEmp(e) })).filter(x => x.s.saldo > 0).sort((a, b) => (b.s.atrasadas.length - a.s.atrasadas.length) || ((a.s.proxima || {}).vencimento || '').localeCompare((b.s.proxima || {}).vencimento || ''));
    const tot = list.reduce((a, x) => a + x.s.saldo, 0), atr = list.reduce((a, x) => a + x.s.atrasadas.reduce((q, p) => q + p.falta, 0), 0);
    b += `<div class="grid"><div class="stat hl"><b>${brl(tot)}</b><small>A receber</small></div><div class="stat"><b style="color:var(--red)">${brl(atr)}</b><small>Em atraso</small></div></div><h2>Devedores (${list.length})</h2>` + (list.map(x => empCard(x.e)).join('') || empty('Ninguém devendo. 🎉')); }
  if (s === 'emp') b += ([...S.emprestimos].reverse().map(empCard).join('') || empty('Nenhum empréstimo.')) + fab('+ Empréstimo', () => A.emprestimo());
  if (s === 'cli') b += (S.clientes.map(c => { const es = S.emprestimos.filter(e => e.cliente_id === c.id), sal = es.reduce((a, e) => a + sitEmp(e).saldo, 0);
    return `<div class="card item"><div class="row"><h3>👤 ${esc(c.nome)}</h3><b>${brl(sal)}</b></div><div class="meta">${esc(c.telefone || '')} ${c.documento ? '· ' + esc(c.documento) : ''} · ${es.length} empréstimo(s)</div>
    ${btns([['Emprestar', h(() => A.emprestimo(null, c)), 'primary'], ['Agendar', h(() => A.evento(null, { cliente_id: c.id, titulo: 'Cobrar ' + c.nome }))], ['Editar', h(() => A.cliente(c)), 'ghost'], ['Excluir', h(() => A.del('hj_clientes', c, c.nome + ' (e os empréstimos dele)')), 'danger']])}</div>`; }).join('') || empty('Nenhum cliente.')) + fab('+ Cliente', () => A.cliente());
  return b;
}
function vAgenda() {
  const items = S.eventos.map(e => ({ t: new Date(e.inicio), e })).concat(todasParcelas().filter(p => p.st !== 'paga').map(p => ({ t: C.parse(p.vencimento), p })));
  items.sort((a, b) => a.t - b.t); const now = new Date(); now.setHours(0, 0, 0, 0);
  const groups = {}; items.forEach(x => { const k = x.t < now && x.p ? 'Atrasados' : x.t < now ? 'Passados' : C.iso(x.t) === hoje() ? 'Hoje' : x.t.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }); (groups[k] = groups[k] || []).push(x); });
  const order = ['Atrasados', 'Hoje'].concat(Object.keys(groups).filter(k => !['Atrasados', 'Hoje', 'Passados'].includes(k)), ['Passados']);
  let b = `<h1>Agenda</h1><p class="muted">Compromissos e vencimentos de parcelas.</p>${Notification && Notification.permission === 'default' ? `<button class="btn full" data-a="${h(pedirNotif)}">🔔 Ativar notificações</button>` : ''}`;
  order.filter(k => groups[k]).forEach(k => { b += `<h2>${k}</h2>` + groups[k].map(x => x.e ? `<div class="card item"><div class="row"><h3>📅 ${esc(x.e.titulo)}</h3><span class="pill st-aberta">${x.t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
    <div class="meta">${x.t.toLocaleDateString('pt-BR')} · lembrete ${x.e.lembrete_min ? x.e.lembrete_min + ' min antes' : 'na hora'}${x.e.cliente_id && byId('clientes', x.e.cliente_id) ? ' · ' + esc(byId('clientes', x.e.cliente_id).nome) : ''}${x.e.obs ? ' · ' + esc(x.e.obs) : ''}</div>
    ${btns([['Editar', h(() => A.evento(x.e)), 'ghost'], ['Excluir', h(() => A.del('hj_eventos', x.e, 'o compromisso')), 'danger']])}</div>`
    : `<div class="card item ${x.p.st === 'atrasada' ? 'late' : 'soon'}"><div class="row"><h3>💵 ${esc(x.p.cli ? x.p.cli.nome : '?')} · ${x.p.numero}ª parcela</h3>${pill(x.p.st)}</div><div class="meta">${dt(x.p.vencimento)} · falta ${brl(x.p.falta)}</div>
    ${btns([['Registrar pagamento', h(() => A.pagamento(x.p.emp)), 'primary'], ['Lembrete', h(() => A.evento(null, { titulo: 'Cobrar ' + (x.p.cli ? x.p.cli.nome : ''), cliente_id: x.p.emp.cliente_id, inicio: x.p.vencimento + 'T09:00' }))]])}</div>`).join(''); });
  if (!items.length) b += empty('Nada agendado.');
  return b + fab('+ Compromisso', () => A.evento());
}
function vEquipe() {
  return `<h2>Equipe e convites</h2><p class="muted">Convide pelo e-mail. A pessoa cria a conta no app com esse e-mail e entra no seu time (acesso só ao chat).</p>` +
    (S.convites.map(c => `<div class="card item"><div class="row"><h3>${esc(c.nome || c.email)}</h3><span class="pill ${c.aceito_em ? 'st-paga' : 'st-pendente'}">${c.aceito_em ? 'Entrou' : 'Aguardando'}</span></div><div class="meta">${esc(c.email)} · ${esc(c.papel)}</div>
    ${btns([['Editar', h(() => A.convite(c)), 'ghost'], ['Excluir', h(() => A.del('hj_convites', c, 'o convite de ' + c.email)), 'danger']])}</div>`).join('') || empty('Nenhum convite.')) + `<button class="btn primary full" data-a="${h(() => A.convite())}">+ Convidar pessoa</button>`;
}
function fab(l, fn) { return `<button class="btn primary fab" data-a="${h(fn)}">${l}</button>`; }
function go(t, s) { tab = t; if (s) sub[{ credito: 'cred', hotel: 'hotel', financas: 'fin' }[t]] = s; render(); scrollTo(0, 0); }

const VIEWS = { inicio: vInicio, hotel: vHotel, financas: vFin, credito: vCred, agenda: vAgenda, chat: () => window.HJChat ? HJChat.view() : '', equipe: vEquipe };
function render() {
  H = {}; hseq = 0; const isDono = !perfil || perfil.papel === 'dono';
  if (!isDono && tab !== 'chat') tab = 'chat';
  $('#app').innerHTML = (DEMO ? '<div class="demo">MODO DEMONSTRAÇÃO — dados só neste aparelho (Supabase não configurado)</div>' : '') + VIEWS[tab]();
  document.querySelectorAll('#nav button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); b.hidden = !isDono && b.dataset.tab !== 'chat'; });
  updateBadges();
}
document.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a && H[a.dataset.a]) { e.preventDefault(); H[a.dataset.a](); return; }
  const s = e.target.closest('[data-sub]'); if (s) { const [k, v] = s.dataset.sub.split(':'); sub[k] = v; render(); return; }
  const n = e.target.closest('#nav button'); if (n) go(n.dataset.tab); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[role=button][data-a]')) e.target.click(); });
document.addEventListener('change', e => { if (e.target.id === 'mesSel') { sub.mes = e.target.value; render(); } });

/* ================= ALERTAS / NOTIFICAÇÕES ================= */
function updateBadges() {
  const al = C.alertas(todasParcelas()), n = al.total;
  const nb = $('#navBadge'), bb = $('#bellBadge'); [nb, bb].forEach(b => { b.hidden = !n; b.textContent = n; });
  const chatN = window.HJChat ? HJChat.unread() : 0, cb = $('#chatBadge'); if (cb) { cb.hidden = !chatN; cb.textContent = chatN; }
  if (navigator.setAppBadge) { (n + chatN) ? navigator.setAppBadge(n + chatN).catch(() => 0) : navigator.clearAppBadge().catch(() => 0); }
}
function pedirNotif() { if (!('Notification' in window)) return toast('Este navegador não suporta notificações'); Notification.requestPermission().then(p => { toast(p === 'granted' ? 'Notificações ativadas' : 'Notificações bloqueadas'); render(); checkNotif(); }); }
function notify(title, body, tag) { if (!('Notification' in window) || Notification.permission !== 'granted') return; const k = 'hj_n_' + tag; if (localStorage.getItem(k)) return; localStorage.setItem(k, '1');
  (navigator.serviceWorker && navigator.serviceWorker.ready ? navigator.serviceWorker.ready.then(r => r.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' })) : Promise.reject()).catch(() => new Notification(title, { body, tag })); }
function checkNotif() {
  if (!S.parcelas) return; const al = C.alertas(todasParcelas()), d = hoje();
  if (al.atrasadas.length) notify('Hotel Jardim · atrasados', `${al.atrasadas.length} parcela(s) em atraso`, 'atr-' + d);
  if (al.hoje.length) notify('Hotel Jardim · vence hoje', al.hoje.map(p => (p.cli ? p.cli.nome : '') + ' ' + brl(p.falta)).join(', '), 'hoje-' + d);
  if (al.breve.length) notify('Hotel Jardim · próximos 3 dias', `${al.breve.length} parcela(s) vencendo em breve`, 'breve-' + d);
  const now = Date.now(); S.eventos.forEach(e => { const t = new Date(e.inicio).getTime(), at = t - (e.lembrete_min || 0) * 60000; if (now >= at && now < t + 3600000) notify('📅 ' + e.titulo, new Date(e.inicio).toLocaleString('pt-BR'), 'ev-' + e.id + '-' + e.inicio); });
}
$('#btnBell').onclick = () => { if ('Notification' in window && Notification.permission === 'default') pedirNotif(); go(perfil && perfil.papel !== 'dono' ? 'chat' : 'credito', 'devendo'); };

/* ================= TEMA / AUTH / BOOT ================= */
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem('hj_theme', t); };
setTheme(localStorage.getItem('hj_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#btnTheme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

async function enter() {
  $('#login').hidden = true; $('#app').hidden = false; $('#nav').hidden = false; $('#btnSair').hidden = DEMO;
  if (!DEMO) { const r = await sb.rpc('hj_entrar', { p_nome: null }); if (!r.error) perfil = r.data; else console.warn(r.error); }
  else perfil = { id: me.id, nome: 'Jhon', papel: 'dono' };
  if (!perfil || perfil.papel === 'dono') await load(); else TABLES.forEach(t => S[t.slice(3)] = []);
  if (window.HJChat) await HJChat.start({ sb, me, perfil, DEMO, h: fn => h(fn), render, toast, esc, compress, updateBadges });
  render(); checkNotif(); setInterval(checkNotif, 60000);
}
function showLogin() { $('#login').hidden = false; $('#app').hidden = true; $('#nav').hidden = true; }
let signup = false;
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, msg = $('#loginMsg'); msg.textContent = '';
  const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
  try { const cred = { email: f.email.value.trim(), password: f.senha.value };
    const r = signup ? await sb.auth.signUp(cred) : await sb.auth.signInWithPassword(cred);
    if (r.error) throw r.error; if (signup && !r.data.session) { msg.style.color = 'var(--g)'; msg.textContent = 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre.'; return; }
    me = r.data.user; await enter();
  } catch (err) { msg.textContent = /Invalid login/i.test(err.message) ? 'E-mail ou senha incorretos.' : err.message; } finally { btn.disabled = false; }
});
$('#btnSair').onclick = async () => { if (!confirm('Sair da conta?')) return; await sb.auth.signOut(); location.reload(); };

(async function boot() {
  const lf = $('#loginForm'); lf.insertAdjacentHTML('beforeend', '<p style="text-align:center"><button type="button" class="btn ghost" id="tglSignup">Criar conta (convidados)</button></p>');
  $('#tglSignup').onclick = () => { signup = !signup; lf.querySelector('button[type=submit]').textContent = signup ? 'Criar conta' : 'Entrar'; $('#tglSignup').textContent = signup ? 'Já tenho conta' : 'Criar conta (convidados)'; };
  if (DEMO) { me = { id: 'demo-owner', email: 'demo@local' }; return enter(); }
  sb = window.supabase.createClient(CFG.url, CFG.anon, { auth: { persistSession: true, storageKey: 'hj-auth' } });
  const { data } = await sb.auth.getSession(); if (data.session) { me = data.session.user; enter(); } else showLogin();
})();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => 0);
window.HJ = { S, go, render, DB };
})();
