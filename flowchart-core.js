/**
 * flowchart-core.js — 「순서도 그리기」 앱의 계산(로직) 부분
 *
 * 화면(DOM)을 그리는 코드는 여기에 하나도 없다 (그건 main.js 가 한다).
 * 그래서 브라우저 없이 node 로도 시험할 수 있다 → node tests/run-tests.js
 *
 * 여기 들어 있는 것
 *   · 순서도의 "기호(node)" 와 "화살표(edge)" 데이터 구조를 만들고 다루는 함수
 *   · 완성된 순서도가 올바른지 검사하는 validate 함수
 *
 * 브라우저에서는 <script src="flowchart-core.js"></script> 로 불러와
 * 전역 변수 FlowchartCore 로 쓰고, node 시험에서는
 * require('../flowchart-core.js') 로 쓴다.
 */
(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     1. 기호(node) 종류

     순서도에는 네 가지 기호가 있다.
       시작/끝 — 둥근 사각형, 순서도의 처음과 끝
       입출력 — 평행사변형, 값을 입력받거나 화면에 보여줄 때
       처리   — 사각형, 계산이나 값 바꾸기
       판단   — 마름모, "예/아니요" 로 갈라지는 곳
     ═══════════════════════════════════════════════════════════ */

  var NODE_TYPES = {
    START_END: 'start-end',
    IO: 'io',
    PROCESS: 'process',
    DECISION: 'decision'
  };

  var NODE_LABELS = {
    'start-end': '시작/끝',
    'io': '입출력',
    'process': '처리',
    'decision': '판단'
  };

  var NODE_SIZE = {
    'start-end': { w: 170, h: 64 },
    'io': { w: 170, h: 76 },
    'process': { w: 170, h: 76 },
    'decision': { w: 170, h: 120 }
  };

  /* ═══════════════════════════════════════════════════════════
     2. id 만들기 — 기호와 화살표마다 서로 다른 이름표가 필요하다
     ═══════════════════════════════════════════════════════════ */

  /** prefix + 시간 + 무작위 문자로 매번 다른 id 를 만든다. */
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ═══════════════════════════════════════════════════════════
     3. 기호(node) 만들기
     ═══════════════════════════════════════════════════════════ */

  /** 새 기호를 만든다. type 은 NODE_TYPES 중 하나, x/y 는 캔버스 위 위치. */
  function createNode(type, x, y, text) {
    var size = NODE_SIZE[type];
    return {
      id: uid('n'),
      type: type,
      x: x,
      y: y,
      w: size.w,
      h: size.h,
      text: text || ''
    };
  }

  /* ═══════════════════════════════════════════════════════════
     4. 화살표(edge) 만들기와 찾기

     화살표는 어디서 시작해서(from) 어디로 가는지(to) 를 나타낸다.
     판단 기호에서 나가는 화살표는 "예" 또는 "아니요" 라벨을 가질 수 있다.
     ═══════════════════════════════════════════════════════════ */

  /** 새 화살표를 만든다. label 은 null 이거나 "예"/"아니요" 문자열. */
  function createEdge(fromId, toId, label) {
    return {
      id: uid('e'),
      from: fromId,
      to: toId,
      label: label || null
    };
  }

  /** nodeId 에서 나가는 화살표들만 골라 배열로 돌려준다. */
  function outgoingEdges(edges, nodeId) {
    return edges.filter(function (e) { return e.from === nodeId; });
  }

  /** nodeId 로 들어오는 화살표들만 골라 배열로 돌려준다. */
  function incomingEdges(edges, nodeId) {
    return edges.filter(function (e) { return e.to === nodeId; });
  }

  /** 판단 기호(nodeId)에서 나가는 화살표들의 라벨만("예"/"아니요") 뽑는다. null 은 뺀다. */
  function decisionEdgeLabels(edges, nodeId) {
    return outgoingEdges(edges, nodeId)
      .map(function (e) { return e.label; })
      .filter(function (label) { return label === '예' || label === '아니요'; });
  }

  /* ═══════════════════════════════════════════════════════════
     5. 기호·화살표 지우기 (원본은 그대로 두고 새 배열을 돌려준다)
     ═══════════════════════════════════════════════════════════ */

  /** nodeId 기호를 지우고, 그 기호에 연결된 화살표도 함께 지운다. */
  function removeNode(nodes, edges, nodeId) {
    var newNodes = nodes.filter(function (n) { return n.id !== nodeId; });
    var newEdges = edges.filter(function (e) { return e.from !== nodeId && e.to !== nodeId; });
    return { nodes: newNodes, edges: newEdges };
  }

  /** edgeId 화살표 하나만 지운다. */
  function removeEdge(edges, edgeId) {
    return edges.filter(function (e) { return e.id !== edgeId; });
  }

  /* ═══════════════════════════════════════════════════════════
     6. validate — 완성된 순서도가 올바른지 검사한다

     issues 배열에 {level, message} 를 계속 쌓아 간다.
     level 이 "error" 인 것이 하나도 없을 때만 ok:true.
     ═══════════════════════════════════════════════════════════ */

  /** 기호 하나가 "시작 역할"을 하는지 — 들어오는 화살표 없고 나가는 화살표는 있어야 한다. */
  function isStartRole(n, incoming, outgoing) {
    return n.type === 'start-end' && incoming.length === 0 && outgoing.length >= 1;
  }

  /** 기호 하나가 "끝 역할"을 하는지 — 나가는 화살표 없고 들어오는 화살표는 있어야 한다. */
  function isEndRole(n, incoming, outgoing) {
    return n.type === 'start-end' && outgoing.length === 0 && incoming.length >= 1;
  }

  /** 기호 하나가 "고립"인지 — 들어오는 화살표도 나가는 화살표도 없다. */
  function isIsolated(incoming, outgoing) {
    return incoming.length === 0 && outgoing.length === 0;
  }

  /** 화면에 보여줄 기호 이름. 내용이 비어 있으면 "(내용 없음 · 기호이름)" 으로. */
  function label(n) {
    var text = (n.text && n.text.trim()) ? n.text.trim() : null;
    return text ? text : ('(내용 없음 · ' + NODE_LABELS[n.type] + ')');
  }

  function validate(nodes, edges) {
    var issues = [];

    // 규칙 0. 빈 캔버스
    if (nodes.length === 0) {
      issues.push({ level: 'error', message: '기호를 배치해서 순서도를 그려 보세요.' });
      return { ok: false, issues: issues };
    }

    // 노드마다 들어오는/나가는 화살표를 미리 구해 둔다.
    var incomingMap = {};
    var outgoingMap = {};
    nodes.forEach(function (n) {
      incomingMap[n.id] = incomingEdges(edges, n.id);
      outgoingMap[n.id] = outgoingEdges(edges, n.id);
    });

    // 규칙 1. 시작/끝 지점 검사
    var starts = nodes.filter(function (n) {
      return isStartRole(n, incomingMap[n.id], outgoingMap[n.id]);
    });
    var ends = nodes.filter(function (n) {
      return isEndRole(n, incomingMap[n.id], outgoingMap[n.id]);
    });

    if (starts.length === 0) {
      issues.push({ level: 'error', message: '순서도에 시작 지점이 없어요. 화살표가 나가기만 하는 시작/끝 기호가 필요해요.' });
    }
    if (starts.length > 1) {
      issues.push({ level: 'warn', message: '시작 지점이 여러 개예요. 하나로 정리해 보세요.' });
    }
    if (ends.length === 0) {
      issues.push({ level: 'error', message: '순서도에 끝 지점이 없어요. 화살표가 들어오기만 하는 시작/끝 기호가 필요해요.' });
    }

    // 규칙 2. 노드마다 연결 상태 검사
    nodes.forEach(function (n) {
      var incoming = incomingMap[n.id];
      var outgoing = outgoingMap[n.id];

      if (isIsolated(incoming, outgoing)) {
        issues.push({ level: 'error', message: "'" + label(n) + "' 기호가 아무 화살표와도 연결되어 있지 않아요." });
        return; // 고립된 노드는 아래 두 검사를 건너뛴다
      }

      if (!isStartRole(n, incoming, outgoing) && incoming.length === 0) {
        issues.push({ level: 'error', message: "'" + label(n) + "' 기호로 들어오는 화살표가 없어요." });
      }
      if (!isEndRole(n, incoming, outgoing) && outgoing.length === 0) {
        issues.push({ level: 'error', message: "'" + label(n) + "' 다음으로 가는 화살표가 없어요." });
      }
    });

    // 규칙 3. 판단 기호는 화살표가 2개(예/아니요) 나가야 한다
    nodes.filter(function (n) { return n.type === 'decision'; }).forEach(function (n) {
      var out = outgoingMap[n.id];
      if (out.length !== 2) {
        issues.push({ level: 'error', message: "'" + label(n) + "' 판단 기호는 화살표가 2개(예/아니요) 나가야 해요. 지금 " + out.length + '개예요.' });
      } else {
        var labels = out.map(function (e) { return e.label; });
        var hasYes = labels.indexOf('예') !== -1;
        var hasNo = labels.indexOf('아니요') !== -1;
        if (!hasYes || !hasNo) {
          issues.push({ level: 'error', message: "'" + label(n) + "' 판단 기호의 화살표에 '예'와 '아니요'를 하나씩 표시해 주세요." });
        }
      }
    });

    // 규칙 4. 판단이 아닌 기호에서 화살표가 여러 개 나가면 경고
    nodes.filter(function (n) { return n.type !== 'decision'; }).forEach(function (n) {
      var out = outgoingMap[n.id];
      if (out.length > 1) {
        issues.push({ level: 'warn', message: "'" + label(n) + "' 기호에서 화살표가 여러 개 나가고 있어요. 판단 기호가 아니라면 화살표를 하나만 연결하는 게 좋아요." });
      }
    });

    // 규칙 5. 내용이 비어 있는 기호는 경고
    nodes.forEach(function (n) {
      if (!n.text || !n.text.trim()) {
        issues.push({ level: 'warn', message: "'" + NODE_LABELS[n.type] + "' 기호 안에 내용을 적어 주세요." });
      }
    });

    var ok = !issues.some(function (issue) { return issue.level === 'error'; });
    return { ok: ok, issues: issues };
  }

  /* ═══════════════════════════════════════════════════════════
     내보내기
     ═══════════════════════════════════════════════════════════ */

  var FlowchartCore = {
    NODE_TYPES: NODE_TYPES,
    NODE_LABELS: NODE_LABELS,
    NODE_SIZE: NODE_SIZE,
    uid: uid,
    createNode: createNode,
    createEdge: createEdge,
    outgoingEdges: outgoingEdges,
    incomingEdges: incomingEdges,
    decisionEdgeLabels: decisionEdgeLabels,
    removeNode: removeNode,
    removeEdge: removeEdge,
    validate: validate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlowchartCore;
  } else {
    global.FlowchartCore = FlowchartCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
