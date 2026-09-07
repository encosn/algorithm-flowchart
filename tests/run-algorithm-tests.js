/**
 * algorithm-core.js 단위 시험 — 실행: node tests/run-algorithm-tests.js
 *
 * 화면 없이 buildOutline / checkAnswers 두 함수만 확인한다.
 * flowchart-core.js 의 createNode/createEdge 는 쓰지 않고,
 * 순수한 객체 리터럴로 nodes/edges 를 직접 만든다.
 */
const A = require('../algorithm-core.js');

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  v ' + name); }
  else { fail++; console.log('  x ' + name + (extra ? '  -> ' + extra : '')); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, '기대 ' + JSON.stringify(expected) + ', 실제 ' + JSON.stringify(actual));
}
function group(title) { console.log('\n[' + title + ']'); }

/* ───────── 1. 빈 순서도 ───────── */
group('buildOutline: 빈 순서도');
const emptyResult = A.buildOutline([], []);
ok('error 는 null 이 아닌 문자열이다', typeof emptyResult.error === 'string' && emptyResult.error.length > 0, emptyResult.error);
eq('steps 는 빈 배열', emptyResult.steps.length, 0);

/* ───────── 2. 단순 3개 기호 체인 (시작 -> 처리 -> 끝) ───────── */
group('buildOutline: 시작->처리->끝 (순차)');
const chainNodes = [
  { id: 's', type: 'start-end', text: '시작' },
  { id: 'p', type: 'process', text: '값 더하기' },
  { id: 'e', type: 'start-end', text: '끝' }
];
const chainEdges = [
  { id: 'e1', from: 's', to: 'p', label: null },
  { id: 'e2', from: 'p', to: 'e', label: null }
];
const chainResult = A.buildOutline(chainNodes, chainEdges);
eq('error 는 null', chainResult.error, null);
eq('steps 는 정확히 3개', chainResult.steps.length, 3);
ok('세 항목 모두 kind: node', chainResult.steps.every(function (st) { return st.kind === 'node'; }));
ok('세 항목 모두 depth: 0', chainResult.steps.every(function (st) { return st.depth === 0; }));
eq('stepIndex 순서 0', chainResult.steps[0].stepIndex, 0);
eq('stepIndex 순서 1', chainResult.steps[1].stepIndex, 1);
eq('stepIndex 순서 2', chainResult.steps[2].stepIndex, 2);
eq('첫 항목 nodeId 는 s', chainResult.steps[0].nodeId, 's');
eq('둘째 항목 nodeId 는 p', chainResult.steps[1].nodeId, 'p');
eq('셋째 항목 nodeId 는 e', chainResult.steps[2].nodeId, 'e');
eq('첫 항목 nodeType 은 start-end', chainResult.steps[0].nodeType, 'start-end');
eq('둘째 항목 nodeType 은 process', chainResult.steps[1].nodeType, 'process');
eq('셋째 항목 nodeType 은 start-end', chainResult.steps[2].nodeType, 'start-end');

/* ───────── 3. if/else, 서로 다른 끝으로 갈라짐 (병합 없음) ───────── */
group('buildOutline: if/else, 각자 다른 끝');
const ifNodes = [
  { id: 's', type: 'start-end', text: '시작' },
  { id: 'd', type: 'decision', text: '5보다 큰가?' },
  { id: 'pa', type: 'process', text: '큰 경우 처리' },
  { id: 'ea', type: 'start-end', text: '끝A' },
  { id: 'pb', type: 'process', text: '작은 경우 처리' },
  { id: 'eb', type: 'start-end', text: '끝B' }
];
const ifEdges = [
  { id: 'e1', from: 's', to: 'd', label: null },
  { id: 'e2', from: 'd', to: 'pa', label: '예' },
  { id: 'e3', from: 'pa', to: 'ea', label: null },
  { id: 'e4', from: 'd', to: 'pb', label: '아니요' },
  { id: 'e5', from: 'pb', to: 'eb', label: null }
];
const ifResult = A.buildOutline(ifNodes, ifEdges);
eq('error 는 null', ifResult.error, null);
const branchSteps = ifResult.steps.filter(function (st) { return st.kind === 'branch'; });
eq('branch 항목은 정확히 2개', branchSteps.length, 2);
ok('branch 하나는 label 예', branchSteps.some(function (st) { return st.label === '예'; }));
ok('branch 하나는 label 아니요', branchSteps.some(function (st) { return st.label === '아니요'; }));
ok('branch 둘 다 decisionNodeId 가 d', branchSteps.every(function (st) { return st.decisionNodeId === 'd'; }));
ok('branch 둘 다 depth 1', branchSteps.every(function (st) { return st.depth === 1; }));
const paStep = ifResult.steps.find(function (st) { return st.kind === 'node' && st.nodeId === 'pa'; });
const pbStep = ifResult.steps.find(function (st) { return st.kind === 'node' && st.nodeId === 'pb'; });
eq('pa 는 depth 1', paStep.depth, 1);
eq('pb 는 depth 1', pbStep.depth, 1);
const nodeKindSteps = ifResult.steps.filter(function (st) { return st.kind === 'node'; });
eq('node 항목은 총 6개', nodeKindSteps.length, 6);
const paIndex = ifResult.steps.indexOf(paStep);
const pbIndex = ifResult.steps.indexOf(pbStep);
ok('예 가지(pa)가 아니요 가지(pb)보다 먼저 나온다', paIndex < pbIndex, paIndex + ' vs ' + pbIndex);

/* ───────── 4. if/else 가 다시 합쳐지는 경우 (merge) ───────── */
group('buildOutline: if/else 병합(merge)');
const mergeNodes = [
  { id: 's', type: 'start-end', text: '시작' },
  { id: 'd', type: 'decision', text: '5보다 큰가?' },
  { id: 'pa', type: 'process', text: '큰 경우 처리' },
  { id: 'pb', type: 'process', text: '작은 경우 처리' },
  { id: 'common', type: 'start-end', text: '끝' }
];
const mergeEdges = [
  { id: 'e1', from: 's', to: 'd', label: null },
  { id: 'e2', from: 'd', to: 'pa', label: '예' },
  { id: 'e3', from: 'pa', to: 'common', label: null },
  { id: 'e4', from: 'd', to: 'pb', label: '아니요' },
  { id: 'e5', from: 'pb', to: 'common', label: null }
];
const mergeResult = A.buildOutline(mergeNodes, mergeEdges);
eq('error 는 null', mergeResult.error, null);
const mergeKindSteps = mergeResult.steps.filter(function (st) { return st.kind === 'merge'; });
eq('merge 항목은 정확히 1개', mergeKindSteps.length, 1);
const commonNodeSteps = mergeResult.steps.filter(function (st) { return st.kind === 'node' && st.nodeId === 'common'; });
eq('common 은 node 항목으로 딱 1번만 등장', commonNodeSteps.length, 1);
eq('merge 의 targetStepIndex 는 common 의 stepIndex 와 같다', mergeKindSteps[0].targetStepIndex, commonNodeSteps[0].stepIndex);
eq('merge 의 targetNodeId 는 common', mergeKindSteps[0].targetNodeId, 'common');

/* ───────── 5. 반복(loop) ───────── */
group('buildOutline: 반복(loop)');
const loopNodes = [
  { id: 's', type: 'start-end', text: '시작' },
  { id: 'd', type: 'decision', text: '10번 채웠는가?' },
  { id: 'e', type: 'start-end', text: '끝' },
  { id: 'p', type: 'process', text: '변수 늘리기' }
];
const loopEdges = [
  { id: 'e1', from: 's', to: 'd', label: null },
  { id: 'e2', from: 'd', to: 'e', label: '예' },
  { id: 'e3', from: 'd', to: 'p', label: '아니요' },
  { id: 'e4', from: 'p', to: 'd', label: null }
];
const loopResult = A.buildOutline(loopNodes, loopEdges);
eq('error 는 null', loopResult.error, null);
const loopKindSteps = loopResult.steps.filter(function (st) { return st.kind === 'loop'; });
eq('loop 항목은 정확히 1개', loopKindSteps.length, 1);
const dNodeStep = loopResult.steps.find(function (st) { return st.kind === 'node' && st.nodeId === 'd'; });
eq('loop 의 targetNodeId 는 판단 기호 d', loopKindSteps[0].targetNodeId, 'd');
eq('loop 의 targetStepIndex 는 d 자신의 stepIndex', loopKindSteps[0].targetStepIndex, dNodeStep.stepIndex);
const mergeInLoop = loopResult.steps.filter(function (st) { return st.kind === 'merge'; });
eq('이 경우 merge 항목은 없다(반복으로 분류돼야 함)', mergeInLoop.length, 0);

/* ───────── 6. checkAnswers ───────── */
group('checkAnswers');
const answerSteps = [
  { kind: 'node', depth: 0, nodeId: 'a', stepIndex: 0, nodeType: 'start-end' },
  { kind: 'branch', depth: 1, label: '예', decisionNodeId: 'a' },
  { kind: 'node', depth: 1, nodeId: 'b', stepIndex: 1, nodeType: 'process' },
  { kind: 'branch', depth: 1, label: '아니요', decisionNodeId: 'a' },
  { kind: 'node', depth: 1, nodeId: 'c', stepIndex: 2, nodeType: 'process' }
];

const allFilled = A.checkAnswers(answerSteps, { a: 'x', b: 'y', c: 'z' });
eq('모두 채우면 ok 는 true', allFilled.ok, true);
eq('모두 채우면 missing 은 빈 배열', allFilled.missing.length, 0);

const someBlank = A.checkAnswers(answerSteps, { a: 'x', b: '   ', c: '' });
eq('공백/빈 문자열이면 ok 는 false', someBlank.ok, false);
eq('missing 은 [b, c] (순서대로)', JSON.stringify(someBlank.missing), JSON.stringify(['b', 'c']));

const noneFilled = A.checkAnswers(answerSteps, {});
eq('빈 answers 객체면 세 개 다 missing', JSON.stringify(noneFilled.missing), JSON.stringify(['a', 'b', 'c']));
eq('빈 answers 객체면 ok 는 false', noneFilled.ok, false);

console.log('\n결과: 통과 ' + pass + ' / 실패 ' + fail);
process.exit(fail ? 1 : 0);
