/**
 * algorithm-core.js — 「순서도 그리기」 앱의 3단계, 의사코드 변환 로직
 *
 * 완성된 순서도(nodes/edges)를 시작 기호부터 깊이 우선으로 따라가며
 * 학생이 빈칸을 채울 "의사코드 개요(outline)" 를 만든다.
 * 화면(DOM)을 그리는 코드는 여기에 하나도 없다 (그건 main.js 가 한다).
 * 그래서 브라우저 없이 node 로도 시험할 수 있다 → node tests/run-algorithm-tests.js
 *
 * 여기 들어 있는 것
 *   · buildOutline — 순서도 그래프를 따라가며 순차/선택/반복 구조를 찾아 outline 을 만든다
 *   · checkAnswers — 학생이 입력한 답 중 빈칸을 골라낸다
 *
 * 브라우저에서는 <script src="algorithm-core.js"></script> 로 불러와
 * 전역 변수 AlgorithmCore 로 쓰고, node 시험에서는
 * require('../algorithm-core.js') 로 쓴다.
 */
(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     buildOutline — 순서도를 깊이 우선으로 따라가며 outline 을 만든다

     steps 배열의 각 항목은 kind 로 구분된다.
       'node'   — 실제 기호 하나 (처음 만났을 때만)
       'branch' — 판단 기호에서 "예"/"아니요" 가지가 시작되는 지점
       'loop'   — 이미 지나온 자기 자신(조상)으로 되돌아가는 화살표 (반복)
       'merge'  — 서로 다른 가지가 같은 기호로 다시 합쳐지는 지점
     ═══════════════════════════════════════════════════════════ */

  function buildOutline(nodes, edges) {
    // 시작 기호 찾기: 들어오는 화살표 0개, 나가는 화살표 1개 이상인 '시작/끝' 기호.
    var startNode = null;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.type !== 'start-end') continue;
      var incomingCount = edges.filter(function (e) { return e.to === n.id; }).length;
      var outgoingCount = edges.filter(function (e) { return e.from === n.id; }).length;
      if (incomingCount === 0 && outgoingCount >= 1) {
        startNode = n;
        break;
      }
    }

    if (!startNode) {
      return { steps: [], error: '시작 기호를 찾을 수 없어요.' };
    }

    var steps = [];
    var visitedAt = {}; // nodeId -> stepIndex (처음 방문한 순서)
    var nodeStepCounter = 0;

    function outgoingOf(nodeId) {
      return edges.filter(function (e) { return e.from === nodeId; });
    }

    function findNodeById(id) {
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].id === id) return nodes[j];
      }
      return null;
    }

    function visit(nodeId, depth, ancestors) {
      // 이미 방문한 기호라면 — 조상이면 '반복', 아니면 '병합'
      if (Object.prototype.hasOwnProperty.call(visitedAt, nodeId)) {
        var targetStepIndex = visitedAt[nodeId];
        if (ancestors.indexOf(nodeId) !== -1) {
          steps.push({ kind: 'loop', depth: depth, targetNodeId: nodeId, targetStepIndex: targetStepIndex });
        } else {
          steps.push({ kind: 'merge', depth: depth, targetNodeId: nodeId, targetStepIndex: targetStepIndex });
        }
        return;
      }

      // 처음 만나는 기호
      var node = findNodeById(nodeId);
      if (!node) return; // 방어적 처리 — 정상 입력에서는 일어나지 않는다

      var stepIndex = nodeStepCounter++;
      visitedAt[nodeId] = stepIndex;
      steps.push({ kind: 'node', depth: depth, nodeId: nodeId, stepIndex: stepIndex, nodeType: node.type });

      // 끝 지점인지 확인 (시작/끝 기호이면서 나가는 화살표가 없음)
      var outs0 = outgoingOf(nodeId);
      if (node.type === 'start-end' && outs0.length === 0) {
        return;
      }

      var newAncestors = ancestors.concat([nodeId]);

      if (node.type === 'decision') {
        var outs = outgoingOf(nodeId);
        var yesEdge = outs.find(function (e) { return e.label === '예'; });
        var noEdge = outs.find(function (e) { return e.label === '아니요'; });

        steps.push({ kind: 'branch', depth: depth + 1, label: '예', decisionNodeId: nodeId });
        if (yesEdge) visit(yesEdge.to, depth + 1, newAncestors);

        steps.push({ kind: 'branch', depth: depth + 1, label: '아니요', decisionNodeId: nodeId });
        if (noEdge) visit(noEdge.to, depth + 1, newAncestors);
      } else {
        var out = outgoingOf(nodeId)[0];
        if (out) {
          visit(out.to, depth, newAncestors);
        }
        // out 이 없으면(정상 입력에서는 일어나지 않음) 그냥 종료
      }
    }

    visit(startNode.id, 0, []);

    return { steps: steps, error: null };
  }

  /* ═══════════════════════════════════════════════════════════
     checkAnswers — 학생이 아직 채우지 않은 빈칸을 찾는다
     ═══════════════════════════════════════════════════════════ */

  function checkAnswers(steps, answers) {
    var missing = [];
    steps.forEach(function (step) {
      if (step.kind !== 'node') return;
      var value = answers ? answers[step.nodeId] : undefined;
      if (value === null || value === undefined || String(value).trim() === '') {
        missing.push(step.nodeId);
      }
    });
    return { ok: missing.length === 0, missing: missing };
  }

  /* ═══════════════════════════════════════════════════════════
     내보내기
     ═══════════════════════════════════════════════════════════ */

  var AlgorithmCore = {
    buildOutline: buildOutline,
    checkAnswers: checkAnswers
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlgorithmCore;
  } else {
    global.AlgorithmCore = AlgorithmCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
