/* Hotel Jardim — regras de cálculo (browser + Node) */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.HJCalc = f(); })(this, function () {
  const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  function addMonths(s, k) {
    const d = parse(s), day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + k, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last)); return iso(t);
  }
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  /** valor, taxa (% a.m.), n, tipo 'simples' | 'composto' (Tabela Price) */
  function loan(valor, taxa, n, tipo) {
    valor = Number(valor); n = Math.max(1, parseInt(n, 10) || 1); const i = Number(taxa) / 100;
    let parcela;
    if (tipo === 'composto') parcela = i === 0 ? valor / n : valor * i / (1 - Math.pow(1 + i, -n));
    else parcela = valor * (1 + i * n) / n;
    parcela = r2(parcela);
    const vals = Array(n).fill(parcela);
    const total = tipo === 'composto' ? r2(parcela * n) : r2(valor * (1 + i * n));
    vals[n - 1] = r2(total - parcela * (n - 1)); // ajusta centavos na última
    return { parcela, total, juros: r2(total - valor), valores: vals };
  }
  function schedule(emp) {
    const l = loan(emp.valor, emp.taxa, emp.parcelas, emp.tipo);
    const base = emp.primeiro_vencimento || emp.data, off = emp.primeiro_vencimento ? 0 : 1;
    return l.valores.map((v, k) => ({ numero: k + 1, vencimento: addMonths(base, k + off), valor: v }));
  }
  /** distribui pagamentos (FIFO) nas parcelas e calcula situação */
  function situacao(parcelas, pagamentos, hoje) {
    hoje = hoje || iso(new Date());
    let pago = r2((pagamentos || []).reduce((s, p) => s + Number(p.valor), 0));
    const total = r2(parcelas.reduce((s, p) => s + Number(p.valor), 0));
    let resto = pago;
    const ps = [...parcelas].sort((a, b) => a.numero - b.numero).map(p => {
      const ap = Math.min(resto, Number(p.valor)); resto = r2(resto - ap);
      const falta = r2(Number(p.valor) - ap), dias = daysBetween(hoje, p.vencimento);
      let st = falta <= 0.004 ? 'paga' : dias < 0 ? 'atrasada' : dias === 0 ? 'hoje' : dias <= 3 ? 'breve' : 'aberta';
      return Object.assign({}, p, { pago: r2(ap), falta, dias, st });
    });
    return { total, pago, saldo: r2(Math.max(0, total - pago)), parcelas: ps,
      atrasadas: ps.filter(p => p.st === 'atrasada'), proxima: ps.find(p => p.st !== 'paga') || null };
  }
  function alertas(lista) { // lista de parcelas já com st
    const a = { hoje: [], breve: [], atrasadas: [] };
    lista.forEach(p => { if (p.st === 'hoje') a.hoje.push(p); else if (p.st === 'breve') a.breve.push(p); else if (p.st === 'atrasada') a.atrasadas.push(p); });
    a.total = a.hoje.length + a.breve.length + a.atrasadas.length; return a;
  }
  /* ---- quartos ---- */
  const STATUS = ['disponivel', 'ocupado', 'limpeza', 'manutencao'];
  const TRANS = { checkin: { disponivel: 'ocupado' }, checkout: { ocupado: 'limpeza' }, limpo: { limpeza: 'disponivel' },
    manutencao: { disponivel: 'manutencao', limpeza: 'manutencao' }, liberar: { manutencao: 'disponivel' } };
  function nextStatus(atual, evento) {
    const n = (TRANS[evento] || {})[atual];
    if (!n) throw new Error('Ação "' + evento + '" não permitida para quarto ' + atual);
    return n;
  }
  function ocupacao(quartos) {
    const c = { disponivel: 0, ocupado: 0, limpeza: 0, manutencao: 0, total: quartos.length };
    quartos.forEach(q => { if (c[q.status] != null) c[q.status]++; });
    c.taxa = c.total ? Math.round(c.ocupado * 100 / c.total) : 0; return c;
  }
  function estadia(entrada, saida, diaria) { const n = Math.max(1, daysBetween(entrada, saida)); return { noites: n, valor: r2(n * Number(diaria || 0)) }; }
  function resumoMes(mes, { hospedagens = [], despesas = [], limpezas = [] }) { // mes 'YYYY-MM'
    const no = d => String(d || '').slice(0, 7) === mes;
    const receitas = r2(hospedagens.filter(h => no(h.entrada)).reduce((s, h) => s + Number(h.valor), 0));
    const desp = r2(despesas.filter(d => no(d.data)).reduce((s, d) => s + Number(d.valor), 0));
    const cam = r2(limpezas.filter(l => l.pago && no(l.data_pagamento || l.data)).reduce((s, l) => s + Number(l.valor), 0));
    return { receitas, despesas: desp, camareiras: cam, saldo: r2(receitas - desp - cam) };
  }
  return { r2, iso, parse, addMonths, daysBetween, loan, schedule, situacao, alertas, STATUS, nextStatus, ocupacao, estadia, resumoMes };
});
