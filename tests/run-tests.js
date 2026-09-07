/**
 * flowchart-core.js 단위 시험 — 실행: node tests/run-tests.js
 *
 * 화면 없이 데이터 구조와 validate 검사 규칙만 확인한다.
 */
const C = require('../flowchart-core.js');

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  v ' + name); }
  else { fail++; console.log('  x ' + name + (extra ? '  -> ' + extra : '')); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, '기대 ' + expected + ', 실제 ' + actual);
}
function group(title) { console.log('\n[' + title + ']'); }

/** issues 안에 message 를 포함하는 항목이 있는지(원하면 level 도 지정). */
function hasIssue(issues, message, level) {
  return issues.some(function (it) {
    return it.message.indexOf(message) !== -1 && (level ? it.level === level : true);
  });
}

/* ───────── 1. createNode ───────── */
group('createNode');
Object.keys(C.NODE_TYPES).forEach(function (key) {
  const type = C.NODE_TYPES[key];
  const n = C.createNode(type, 10, 20, '내용');
  eq('타입 ' + type + ' 의 너비가 NODE_SIZE 와 같다', n.w, C.NODE_SIZE[type].w);
  eq('타입 ' + type + ' 의 높이가 NODE_SIZE 와 같다', n.h, C.NODE_SIZE[type].h);
});
const nNoText = C.createNode(C.NODE_TYPES.PROCESS, 0, 0);
eq('text 를 안 주면 기본값은 빈 문자열', nNoText.text, '');
const idA = C.createNode(C.NODE_TYPES.PROCESS, 0, 0).id;
const idB = C.createNode(C.NODE_TYPES.PROCESS, 0, 0).id;
ok('createNode 를 두 번 부르면 id 가 서로 다르다', idA !== idB, idA + ' vs ' + idB);

/* ───────── 2. createEdge ───────── */
group('createEdge');
const eNoLabel = C.createEdge('n1', 'n2');
eq('label 을 안 주면 기본값은 null', eNoLabel.label, null);
eq('from 이 정확히 들어간다', eNoLabel.from, 'n1');
eq('to 가 정확히 들어간다', eNoLabel.to, 'n2');
const eWithLabel = C.createEdge('n1', 'n2', '예');
eq('label 을 주면 그 값이 들어간다', eWithLabel.label, '예');

/* ───────── 3. outgoingEdges / incomingEdges ───────── */
group('outgoingEdges / incomingEdges');
const edgesSample = [
  C.createEdge('a', 'b'),
  C.createEdge('a', 'c'),
  C.createEdge('b', 'c')
];
eq('a 에서 나가는 화살표는 2개', C.outgoingEdges(edgesSample, 'a').length, 2);
eq('b 에서 나가는 화살표는 1개', C.outgoingEdges(edgesSample, 'b').length, 1);
eq('c 로 들어오는 화살표는 2개', C.incomingEdges(edgesSample, 'c').length, 2);
eq('a 로 들어오는 화살표는 0개', C.incomingEdges(edgesSample, 'a').length, 0);

/* ───────── 4. decisionEdgeLabels ───────── */
group('decisionEdgeLabels');
const decisionEdges = [
  C.createEdge('d', 'x', '예'),
  C.createEdge('d', 'y', '아니요'),
  C.createEdge('d', 'z')
];
const labels = C.decisionEdgeLabels(decisionEdges, 'd');
eq('null 라벨은 빠지고 2개만 남는다', labels.length, 2);
ok('"예" 가 포함된다', labels.indexOf('예') !== -1);
ok('"아니요" 가 포함된다', labels.indexOf('아니요') !== -1);

/* ───────── 5. removeNode ───────── */
group('removeNode');
const n1 = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '첫번째');
const n2 = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '두번째');
const n3 = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '세번째');
const origNodes = [n1, n2, n3];
const origEdges = [C.createEdge(n1.id, n2.id), C.createEdge(n2.id, n3.id)];
const removed = C.removeNode(origNodes, origEdges, n2.id);
eq('n2 를 지우면 남은 노드는 2개', removed.nodes.length, 2);
ok('남은 노드에 n2 가 없다', removed.nodes.every(function (n) { return n.id !== n2.id; }));
eq('n2 에 연결된 화살표도 함께 지워져 0개가 된다', removed.edges.length, 0);
eq('원본 nodes 배열은 그대로 3개 (불변성)', origNodes.length, 3);
eq('원본 edges 배열은 그대로 2개 (불변성)', origEdges.length, 2);

/* ───────── 6. removeEdge ───────── */
group('removeEdge');
const e1 = C.createEdge(n1.id, n2.id);
const e2 = C.createEdge(n2.id, n3.id);
const edgesForRemove = [e1, e2];
const afterRemoveEdge = C.removeEdge(edgesForRemove, e1.id);
eq('e1 을 지우면 남은 화살표는 1개', afterRemoveEdge.length, 1);
eq('남은 화살표는 e2 다', afterRemoveEdge[0].id, e2.id);
eq('원본 edges 배열은 그대로 2개 (불변성)', edgesForRemove.length, 2);

/* ───────── 7. validate: 빈 캔버스 ───────── */
group('validate: 빈 캔버스');
const emptyResult = C.validate([], []);
eq('ok 는 false', emptyResult.ok, false);
eq('issue 는 정확히 1개', emptyResult.issues.length, 1);
ok('내용이 "기호를 배치" 를 포함한다', hasIssue(emptyResult.issues, '기호를 배치', 'error'));

/* ───────── 8. validate: 시작 기호 없음 ───────── */
group('validate: 시작 기호 없음');
const startEnd1 = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝');
const proc1 = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '처리');
const noStartNodes = [proc1, startEnd1];
const noStartEdges = [C.createEdge(proc1.id, startEnd1.id)];
const noStartResult = C.validate(noStartNodes, noStartEdges);
eq('ok 는 false', noStartResult.ok, false);
ok('"시작 지점이 없어요" 를 포함한다', hasIssue(noStartResult.issues, '시작 지점이 없어요', 'error'));

/* ───────── 9. validate: 끝 기호 없음 ───────── */
group('validate: 끝 기호 없음');
const startEnd2 = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const proc2 = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '처리');
const noEndNodes = [startEnd2, proc2];
const noEndEdges = [C.createEdge(startEnd2.id, proc2.id)];
const noEndResult = C.validate(noEndNodes, noEndEdges);
eq('ok 는 false', noEndResult.ok, false);
ok('"끝 지점이 없어요" 를 포함한다', hasIssue(noEndResult.issues, '끝 지점이 없어요', 'error'));

/* ───────── 10. validate: 시작 -> 처리 -> 끝 (정상) ───────── */
group('validate: 시작->처리->끝 (정상)');
const okStart = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const okProc = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '숫자 더하기');
const okEnd = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝');
const okNodes = [okStart, okProc, okEnd];
const okEdges = [C.createEdge(okStart.id, okProc.id), C.createEdge(okProc.id, okEnd.id)];
const okResult = C.validate(okNodes, okEdges);
eq('ok 는 true', okResult.ok, true);
eq('issue 는 0개', okResult.issues.length, 0);

/* ───────── 11. validate: 판단 기호에서 화살표 1개만 나감 ───────── */
group('validate: 판단 기호 화살표 1개');
const decNode1 = C.createNode(C.NODE_TYPES.DECISION, 0, 0, '5보다 큰가?');
const dStart1 = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const dEnd1 = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝');
const oneOutNodes = [dStart1, decNode1, dEnd1];
const oneOutEdges = [
  C.createEdge(dStart1.id, decNode1.id),
  C.createEdge(decNode1.id, dEnd1.id, '예')
];
const oneOutResult = C.validate(oneOutNodes, oneOutEdges);
ok('"2개(예/아니요)" 관련 error 포함', hasIssue(oneOutResult.issues, '2개(예/아니요)', 'error'));
eq('ok 는 false', oneOutResult.ok, false);

/* ───────── 12. validate: 판단 기호 화살표 2개인데 둘 다 "예" ───────── */
group('validate: 판단 기호 라벨이 둘 다 "예"');
const decNode2 = C.createNode(C.NODE_TYPES.DECISION, 0, 0, '5보다 큰가?');
const dStart2 = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const dEndA = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝A');
const dEndB = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝B');
const bothYesNodes = [dStart2, decNode2, dEndA, dEndB];
const bothYesEdges = [
  C.createEdge(dStart2.id, decNode2.id),
  C.createEdge(decNode2.id, dEndA.id, '예'),
  C.createEdge(decNode2.id, dEndB.id, '예')
];
const bothYesResult = C.validate(bothYesNodes, bothYesEdges);
ok('"예"와 "아니요" 관련 error 포함', hasIssue(bothYesResult.issues, "'예'와 '아니요'", 'error'));
eq('ok 는 false', bothYesResult.ok, false);

/* ───────── 13. validate: 판단 기호 화살표 2개, 예/아니요 각각 하나 (정상) ───────── */
group('validate: 판단 기호 예/아니요 정상');
const decNode3 = C.createNode(C.NODE_TYPES.DECISION, 0, 0, '5보다 큰가?');
const dStart3 = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const dEndC = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝C');
const dEndD = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝D');
const goodDecisionNodes = [dStart3, decNode3, dEndC, dEndD];
const goodDecisionEdges = [
  C.createEdge(dStart3.id, decNode3.id),
  C.createEdge(decNode3.id, dEndC.id, '예'),
  C.createEdge(decNode3.id, dEndD.id, '아니요')
];
const goodDecisionResult = C.validate(goodDecisionNodes, goodDecisionEdges);
ok('"2개(예/아니요)" 관련 error 없음', !hasIssue(goodDecisionResult.issues, '2개(예/아니요)', 'error'));
ok('"예"와 "아니요" 관련 error 없음', !hasIssue(goodDecisionResult.issues, "'예'와 '아니요'", 'error'));

/* ───────── 14. validate: 고립된 노드 ───────── */
group('validate: 고립된 노드');
const isoStart = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const isoEnd = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝');
const isoAlone = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '외톨이');
const isoNodes = [isoStart, isoEnd, isoAlone];
const isoEdges = [C.createEdge(isoStart.id, isoEnd.id)];
const isoResult = C.validate(isoNodes, isoEdges);
ok('"연결되어 있지 않아요" error 포함', hasIssue(isoResult.issues, '연결되어 있지 않아요', 'error'));
eq('ok 는 false', isoResult.ok, false);

/* ───────── 15. validate: text 가 빈 노드는 warn (ok 는 그대로 true 가능) ───────── */
group('validate: 내용 없는 기호 -> warn');
const blankStart = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const blankProc = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, ''); // 내용 없음
const blankEnd = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝');
const blankNodes = [blankStart, blankProc, blankEnd];
const blankEdges = [C.createEdge(blankStart.id, blankProc.id), C.createEdge(blankProc.id, blankEnd.id)];
const blankResult = C.validate(blankNodes, blankEdges);
ok('"내용을 적어 주세요" warn 포함', hasIssue(blankResult.issues, '내용을 적어 주세요', 'warn'));
ok('내용 없음은 error 가 아니다', !hasIssue(blankResult.issues, '내용을 적어 주세요', 'error'));
eq('다른 문제가 없으면 ok 는 true', blankResult.ok, true);

/* ───────── 16. validate: 처리 기호에서 화살표 2개 나감 -> warn 이지만 ok 를 false 로 만들지 않는다 ───────── */
group('validate: 처리 기호 화살표 여러 개 -> warn 은 ok 를 false 로 만들지 않는다');
const multiStart = C.createNode(C.NODE_TYPES.START_END, 0, 0, '시작');
const multiProc = C.createNode(C.NODE_TYPES.PROCESS, 0, 0, '처리');
const multiEndA = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝A');
const multiEndB = C.createNode(C.NODE_TYPES.START_END, 0, 0, '끝B');
const multiNodes = [multiStart, multiProc, multiEndA, multiEndB];
const multiEdges = [
  C.createEdge(multiStart.id, multiProc.id),
  C.createEdge(multiProc.id, multiEndA.id),
  C.createEdge(multiProc.id, multiEndB.id)
];
const multiResult = C.validate(multiNodes, multiEdges);
ok('"화살표가 여러 개 나가고" warn 포함', hasIssue(multiResult.issues, '화살표가 여러 개 나가고', 'warn'));
ok('이 warn 은 error 가 아니다', !hasIssue(multiResult.issues, '화살표가 여러 개 나가고', 'error'));
eq('다른 error 가 없다면 ok 는 그대로 true', multiResult.ok, true);

console.log('\n결과: 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
