const test = require('node:test'), assert = require('node:assert');
const C = require('../calc.js');
test('juros simples', () => { const l = C.loan(1000, 10, 5, 'simples'); assert.equal(l.total, 1500); assert.equal(l.parcela, 300); assert.equal(l.juros, 500); });
test('juros compostos (Price)', () => { const l = C.loan(1000, 10, 3, 'composto'); assert.equal(l.parcela, 402.11); assert.equal(l.valores.reduce((a,b)=>a+b,0).toFixed(2), l.total.toFixed(2)); });
test('taxa zero', () => { assert.equal(C.loan(900, 0, 3, 'composto').parcela, 300); assert.equal(C.loan(900, 0, 3, 'simples').parcela, 300); });
test('centavos na última parcela', () => { const l = C.loan(100, 0, 3, 'simples'); assert.deepEqual(l.valores, [33.33, 33.33, 33.34]); });
test('vencimentos mensais com fim de mês', () => { const s = C.schedule({ valor: 300, taxa: 0, parcelas: 3, tipo: 'simples', data: '2026-01-31' }); assert.deepEqual(s.map(p => p.vencimento), ['2026-02-28', '2026-03-31', '2026-04-30']); });
test('situação: pagamentos FIFO, atraso, hoje, breve', () => {
  const ps = [{ numero: 1, vencimento: '2026-10-01', valor: 100 }, { numero: 2, vencimento: '2026-10-10', valor: 100 }, { numero: 3, vencimento: '2026-10-22', valor: 100 }, { numero: 4, vencimento: '2026-10-24', valor: 100 }, { numero: 5, vencimento: '2026-12-01', valor: 100 }];
  const s = C.situacao(ps, [{ valor: 150 }], '2026-10-22');
  assert.equal(s.saldo, 350); assert.deepEqual(s.parcelas.map(p => p.st), ['paga', 'atrasada', 'hoje', 'breve', 'aberta']);
  assert.equal(s.parcelas[1].falta, 50); const a = C.alertas(s.parcelas); assert.equal(a.total, 3);
});
test('status do quarto', () => {
  assert.equal(C.nextStatus('disponivel', 'checkin'), 'ocupado'); assert.equal(C.nextStatus('ocupado', 'checkout'), 'limpeza');
  assert.equal(C.nextStatus('limpeza', 'limpo'), 'disponivel'); assert.throws(() => C.nextStatus('ocupado', 'checkin'));
  assert.throws(() => C.nextStatus('manutencao', 'checkin'));
  const o = C.ocupacao([{ status: 'disponivel' }, { status: 'ocupado' }, { status: 'limpeza' }, { status: 'disponivel' }]);
  assert.equal(o.disponivel, 2); assert.equal(o.taxa, 25);
});
test('estadia e resumo do mês', () => {
  assert.deepEqual(C.estadia('2026-10-20', '2026-10-23', 150), { noites: 3, valor: 450 });
  assert.equal(C.estadia('2026-10-20', '2026-10-20', 150).noites, 1);
  const r = C.resumoMes('2026-10', { hospedagens: [{ entrada: '2026-10-02', valor: 500 }, { entrada: '2026-09-30', valor: 99 }], despesas: [{ data: '2026-10-05', valor: 120 }], limpezas: [{ pago: true, data: '2026-10-06', valor: 30 }, { pago: false, data: '2026-10-06', valor: 30 }] });
  assert.deepEqual(r, { receitas: 500, despesas: 120, camareiras: 30, saldo: 350 });
});
