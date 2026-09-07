/* main.js — 「문제 정의와 순서도 그리기」 화면 그리기
 *
 * 순서도 데이터 구조와 검사 로직은 flowchart-core.js가, 문제 상황 글은 scenarios.js가 맡는다.
 * 이 파일은 그 둘을 화면(SVG)에 붙이고 학생이 누르는 것에 반응하는 일만 한다.
 *
 * 기호 내용 수정은 캔버스 위 입력창(인라인)으로, 판단 기호의 예/아니요 선택과 파괴적 동작
 * 확인은 여전히 브라우저 기본 대화상자(confirm/alert)를 쓴다. 자세한 이유는 앱 CLAUDE.md 참고.
 */
(function () {
  'use strict';

  var FC = window.FlowchartCore;
  var AC = window.AlgorithmCore;
  var NS = 'http://www.w3.org/2000/svg';
  var DEFAULT_VBOX_W = 1100;
  var DEFAULT_VBOX_H = 650;
  var MIN_VBOX_W = 700, MIN_VBOX_H = 400;
  var MAX_VBOX_W = 2400, MAX_VBOX_H = 1800;
  var VBOX_W = DEFAULT_VBOX_W; // 드래그로 캔버스 크기를 바꾸면 이 값이 바뀐다
  var VBOX_H = DEFAULT_VBOX_H;
  var STORAGE_KEY = 'algorithm-flowchart:v1';
  var MAX_HISTORY = 50;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var svg = $('#flowchart-svg');

  /* ═══════════════════════════════════════════
     상태 (state)
     ═══════════════════════════════════════════ */
  var scenarioId = null;
  /* 학번·이름은 PDF 머리말에만 쓰고 **저장하지 않는다** (save()/load() 에 넣지 않는다).
     교실 컴퓨터는 여러 학생이 돌려 쓰므로, 저장하면 다음 학생 화면에 앞 학생 이름이 남는다.
     프로젝트 규칙(학생 개인정보 수집·저장 금지)도 이쪽을 가리킨다. 새로 고치면 사라진다. */
  var studentId = '';
  var studentName = '';
  var situationText = '';
  var problem = '';
  var initial = '';
  var goal = '';
  var nodes = [];
  var edges = [];
  var mode = null;          // null | 'connect' | 'delete' | 'place:<type>'
  var connectFrom = null;   // 연결 모드에서 먼저 고른 기호의 id
  var dragState = null;
  var editingNodeId = null; // 지금 캔버스 위에서 바로 입력 중인 기호의 id
  var inlineEditorEl = null; // 그 입력창(textarea) 엘리먼트
  var undoStack = [];       // 순서도(nodes/edges)만의 되돌리기 기록. 새로고침하면 비워진다.
  var redoStack = [];
  var algoSteps = [];       // 3단계 — buildOutline() 결과 (탭을 열 때마다 nodes/edges 로 다시 만든다)
  var algoAnswers = {};     // 3단계 — { [nodeId]: 학생이 쓴 의사코드 문장 }

  function findNode(id) { return nodes.filter(function (n) { return n.id === id; })[0]; }

  /* ═══════════════════════════════════════════
     되돌리기 · 다시 실행 (순서도만 대상. 문제 정의 답이나 캔버스 크기는 포함하지 않는다)
     ═══════════════════════════════════════════ */
  function snapshotState() {
    return { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
  }

  function applyState(state) {
    nodes = state.nodes;
    edges = state.edges;
    connectFrom = null;
    render();
    save();
  }

  /** 어떤 동작으로 nodes/edges 를 바꾸기 '직전'에 불러서, 그 이전 상태를 되돌리기 기록에 쌓는다. */
  function pushHistory(explicitSnapshot) {
    undoStack.push(explicitSnapshot || snapshotState());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    var before = undoStack.pop();
    redoStack.push(snapshotState());
    applyState(before);
    updateUndoRedoButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    var after = redoStack.pop();
    undoStack.push(snapshotState());
    applyState(after);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    $('#btn-undo').disabled = !undoStack.length;
    $('#btn-redo').disabled = !redoStack.length;
  }

  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);

  /* ═══════════════════════════════════════════
     저장·불러오기 (이 컴퓨터의 브라우저에만 저장, 개인정보 없음)
     ═══════════════════════════════════════════ */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        scenarioId: scenarioId, situationText: situationText,
        problem: problem, initial: initial, goal: goal,
        nodes: nodes, edges: edges,
        canvasW: VBOX_W, canvasH: VBOX_H,
        algoAnswers: algoAnswers,
      }));
    } catch (e) { /* 저장 공간이 막혀 있으면 조용히 무시 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      scenarioId = data.scenarioId || null;
      situationText = data.situationText || '';
      problem = data.problem || '';
      initial = data.initial || '';
      goal = data.goal || '';
      nodes = Array.isArray(data.nodes) ? data.nodes : [];
      edges = Array.isArray(data.edges) ? data.edges : [];
      VBOX_W = clamp(Number(data.canvasW) || DEFAULT_VBOX_W, MIN_VBOX_W, MAX_VBOX_W);
      VBOX_H = clamp(Number(data.canvasH) || DEFAULT_VBOX_H, MIN_VBOX_H, MAX_VBOX_H);
      algoAnswers = (data.algoAnswers && typeof data.algoAnswers === 'object') ? data.algoAnswers : {};
    } catch (e) { /* 저장된 값이 깨졌으면 새로 시작 */ }
  }

  /* ═══════════════════════════════════════════
     1단계 — 문제 정의
     ═══════════════════════════════════════════ */
  function findScenario(id) {
    var list = window.SCENARIOS || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function renderScenarioCards() {
    var host = $('#scenario-cards');
    host.innerHTML = '';
    (window.SCENARIOS || []).forEach(function (sc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scenario-card' + (sc.id === scenarioId ? ' is-on' : '');
      btn.innerHTML = '<div class="card-emoji">' + sc.emoji + '</div><div class="card-title">' + escapeHtml(sc.title) + '</div>';
      btn.addEventListener('click', function () { selectScenario(sc.id); });
      host.appendChild(btn);
    });
  }

  function applySituationDisplay() {
    var sc = findScenario(scenarioId);
    var isCustom = !sc || sc.custom;
    $('#situation-input').classList.toggle('hidden', !isCustom);
    $('#situation-display').classList.toggle('hidden', isCustom);
    if (isCustom) {
      $('#situation-input').value = situationText;
    } else {
      $('#situation-display').textContent = situationText;
    }
  }

  function selectScenario(id) {
    var sc = findScenario(id);
    if (!sc) return;
    scenarioId = id;
    situationText = sc.custom ? situationText : sc.situation;
    renderScenarioCards();
    applySituationDisplay();
    refreshDefineFeedbackIfShown();
    save();
  }

  $('#situation-input').addEventListener('input', function (e) {
    situationText = e.target.value;
    refreshDefineFeedbackIfShown();
    save();
  });

  /* 학번·이름은 메모리에만 담는다 (일부러 save() 를 부르지 않는다 — 위 상태 선언부 주석 참고) */
  $('#input-student-id').addEventListener('input', function (e) { studentId = e.target.value; });
  $('#input-student-name').addEventListener('input', function (e) { studentName = e.target.value; });

  $('#input-problem').addEventListener('input', function (e) { problem = e.target.value; refreshDefineFeedbackIfShown(); save(); });
  $('#input-initial').addEventListener('input', function (e) { initial = e.target.value; refreshDefineFeedbackIfShown(); save(); });
  $('#input-goal').addEventListener('input', function (e) { goal = e.target.value; refreshDefineFeedbackIfShown(); save(); });

  $$('[data-hint]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var field = btn.dataset.hint;
      var box = $('#hint-' + field);
      var sc = findScenario(scenarioId) || (window.SCENARIOS || [])[(window.SCENARIOS || []).length - 1];
      var showing = !box.classList.contains('hidden');
      if (showing) {
        box.classList.add('hidden');
        btn.textContent = '힌트 보기';
      } else {
        box.textContent = (sc && sc.hint && sc.hint[field]) || '문제 상황을 다시 읽고 생각해 보세요.';
        box.classList.remove('hidden');
        btn.textContent = '힌트 숨기기';
      }
    });
  });

  /* ═══════════════════════════════════════════
     1단계 다 썼는지 검사 — 안 쓴 칸이 있으면 2·3단계로 넘어가지 못한다.

     교과서 흐름(문제 정의 → 순서도 → 알고리즘)을 지키게 하려는 것이다.
     빈 칸이 있으면 그냥 막지 않고 **어느 칸이 비었는지 목록으로 알려 주고
     그 칸을 빨갛게 표시**한 뒤 첫 빈 칸으로 커서를 옮긴다.
     ═══════════════════════════════════════════ */
  var DEFINE_FIELDS = [
    { key: 'problem', label: '해결해야 할 문제', inputId: 'input-problem', get: function () { return problem; } },
    { key: 'initial', label: '초기 상태', inputId: 'input-initial', get: function () { return initial; } },
    { key: 'goal', label: '목표 상태', inputId: 'input-goal', get: function () { return goal; } },
  ];

  /** 아직 안 쓴 항목을 순서대로 돌려준다. 빈 배열이면 1단계를 다 쓴 것이다. */
  function defineMissing() {
    var missing = [];
    // 문제 상황: 카드를 아예 안 골랐거나, 「직접 입력하기」인데 아무것도 안 썼을 때
    if (!findScenario(scenarioId) || !String(situationText).trim()) {
      missing.push({ key: 'situation', label: '문제 상황', inputId: 'situation-input' });
    }
    DEFINE_FIELDS.forEach(function (f) {
      if (!String(f.get()).trim()) missing.push(f);
    });
    return missing;
  }

  /** 빈 칸을 빨갛게 표시하고 안내 상자를 그린다. missing 이 빈 배열이면 표시를 모두 지운다. */
  function renderDefineFeedback(missing) {
    var missingKeys = missing.map(function (m) { return m.key; });

    $('#situation-block').classList.toggle('is-missing', missingKeys.indexOf('situation') !== -1);
    $('#scenario-cards').classList.toggle('is-missing', !findScenario(scenarioId));
    DEFINE_FIELDS.forEach(function (f) {
      var field = $('#' + f.inputId).closest('.field');
      if (field) field.classList.toggle('is-missing', missingKeys.indexOf(f.key) !== -1);
    });

    var box = $('#define-feedback');
    if (!missing.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden', 'is-ok');
    box.classList.add('is-bad');
    box.innerHTML = '<p>✋ <b>먼저 1단계를 다 써야 순서도를 그릴 수 있어요.</b></p><ul>' +
      missing.map(function (m) {
        return '<li class="issue-error">' + escapeHtml(m.label) + ' — 아직 안 썼어요.</li>';
      }).join('') + '</ul>';
  }

  /** 이미 표시된 경고가 있을 때만 다시 계산한다 (아직 아무것도 안 눌렀는데 빨갛게 만들지 않으려고). */
  function refreshDefineFeedbackIfShown() {
    if ($('#define-feedback').classList.contains('hidden')) return;
    renderDefineFeedback(defineMissing());
  }

  /* ═══════════════════════════════════════════
     탭 전환
     ═══════════════════════════════════════════ */
  function showTab(name) {
    $$('.tab').forEach(function (b) { b.classList.toggle('is-on', b.dataset.tab === name); });
    $$('.panel').forEach(function (p) { p.classList.toggle('is-on', p.id === 'tab-' + name); });
    if (name === 'flowchart') renderRecap();
    if (name === 'algorithm') renderAlgoOutline();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * 탭 이동의 유일한 입구. 2·3단계로 가려는데 1단계가 덜 채워져 있으면
   * 넘어가지 않고 1단계에 머무르며(또는 1단계로 되돌리며) 무엇이 비었는지 보여 준다.
   */
  function goToTab(name) {
    if (name === 'flowchart' || name === 'algorithm') {
      var missing = defineMissing();
      if (missing.length) {
        showTab('define');
        renderDefineFeedback(missing);
        var first = $('#' + missing[0].inputId);
        // 카드를 안 골랐으면 입력창이 숨어 있을 수 있으니, 보이는 것만 커서를 옮긴다.
        if (first && !first.classList.contains('hidden')) first.focus();
        $('#define-feedback').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      renderDefineFeedback([]); // 다 채웠으니 남아 있던 경고를 지운다
    }
    showTab(name);
  }

  $$('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () { goToTab(btn.dataset.tab); });
  });
  $('#btn-to-flowchart').addEventListener('click', function () { goToTab('flowchart'); });
  $('#btn-back-to-flowchart').addEventListener('click', function () { goToTab('flowchart'); });
  $('#btn-to-algorithm').addEventListener('click', function () { goToTab('algorithm'); });

  function renderRecap() {
    $('#recap-box').innerHTML =
      '<div class="recap-row"><b>해결해야 할 문제.</b> ' + (escapeHtml(problem) || '아직 안 썼어요.') + '</div>' +
      '<div class="recap-row"><b>초기 상태.</b> ' + (escapeHtml(initial) || '아직 안 썼어요.') + '</div>' +
      '<div class="recap-row"><b>목표 상태.</b> ' + (escapeHtml(goal) || '아직 안 썼어요.') + '</div>';
  }

  /* ═══════════════════════════════════════════
     2단계 — 모드·안내문
     ═══════════════════════════════════════════ */
  function updatePaletteActiveStates() {
    $$('.shape-btn').forEach(function (b) { b.classList.toggle('is-on', mode === 'place:' + b.dataset.shape); });
    $('#btn-mode-connect').classList.toggle('is-on', mode === 'connect');
    $('#btn-mode-delete').classList.toggle('is-on', mode === 'delete');
  }

  function updateModeIndicator() {
    var el = $('#mode-indicator');
    if (mode === null) {
      el.textContent = '기호를 누르면 내용을 고칠 수 있고, 드래그하면 옮길 수 있어요. 새 기호를 놓으려면 아래 팔레트를 눌러 보세요.';
    } else if (mode === 'connect') {
      el.textContent = connectFrom ? '이제 연결될 두 번째 기호를 눌러 보세요.' : '연결할 첫 번째 기호를 눌러 보세요.';
    } else if (mode === 'delete') {
      el.textContent = '지울 기호나 화살표를 눌러 보세요.';
    } else if (mode.indexOf('place:') === 0) {
      var type = mode.slice(6);
      el.textContent = "빈 곳을 누르면 '" + FC.NODE_LABELS[type] + "' 기호를 놓고, 이미 놓은 기호를 누르면 내용을 고쳐요. (그만두려면 팔레트에서 같은 기호를 다시 누르세요)";
    }
  }

  function setMode(next) {
    mode = next;
    connectFrom = null;
    updatePaletteActiveStates();
    updateModeIndicator();
    render();
  }

  $$('.shape-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var type = btn.dataset.shape;
      setMode(mode === 'place:' + type ? null : 'place:' + type);
    });
  });
  $('#btn-mode-connect').addEventListener('click', function () { setMode(mode === 'connect' ? null : 'connect'); });
  $('#btn-mode-delete').addEventListener('click', function () { setMode(mode === 'delete' ? null : 'delete'); });

  $('#btn-clear-canvas').addEventListener('click', function () {
    if (!nodes.length && !edges.length) return;
    if (!confirm('캔버스를 모두 지울까요? (지운 뒤에도 되돌리기 버튼으로 다시 살릴 수 있어요)')) return;
    pushHistory();
    nodes = []; edges = [];
    setMode(null);
    $('#check-feedback').classList.add('hidden');
    save();
  });

  $('#btn-reset-flowchart').addEventListener('click', function () {
    if (!confirm('문제 정의부터 순서도까지 모두 지우고 처음부터 다시 시작할까요? 되돌릴 수 없어요.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
    window.location.reload();
  });

  /* ═══════════════════════════════════════════
     좌표 변환·도형 기하
     ═══════════════════════════════════════════ */
  function toSvgPoint(evt) {
    var rect = svg.getBoundingClientRect();
    var scale = VBOX_W / rect.width;
    return { x: (evt.clientX - rect.left) * scale, y: (evt.clientY - rect.top) * scale };
  }

  /** node 중심에서 (dx,dy) 방향으로 뻗은 반직선이 node의 사각 테두리와 만나는 점. */
  function boundaryPoint(node, dx, dy) {
    if (!dx && !dy) return { x: node.x, y: node.y };
    var halfW = node.w / 2, halfH = node.h / 2;
    var scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }

  function wrapLines(text, w, fontSize) {
    var words = (text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var maxChars = Math.max(3, Math.floor((w - 20) / (fontSize * 0.95)));
    var lines = [];
    var cur = '';
    words.forEach(function (word) {
      var cand = cur ? cur + ' ' + word : word;
      if (cand.length > maxChars && cur) { lines.push(cur); cur = word; }
      else cur = cand;
    });
    if (cur) lines.push(cur);
    var finalLines = [];
    lines.forEach(function (line) {
      if (line.length <= maxChars) { finalLines.push(line); return; }
      for (var i = 0; i < line.length; i += maxChars) finalLines.push(line.slice(i, i + maxChars));
    });
    if (finalLines.length > 4) {
      finalLines = finalLines.slice(0, 4);
      var last = finalLines[3];
      finalLines[3] = last.slice(0, Math.max(0, maxChars - 1)) + '…';
    }
    return finalLines;
  }

  /* ═══════════════════════════════════════════
     그리기 (SVG)
     ═══════════════════════════════════════════ */
  function buildDefs() {
    var defs = document.createElementNS(NS, 'defs');
    var marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'fc-arrow');
    marker.setAttribute('markerWidth', '12');
    marker.setAttribute('markerHeight', '12');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M0,0 L12,6 L0,12 Z');
    path.setAttribute('fill', '#1f2937');
    marker.appendChild(path);
    defs.appendChild(marker);
    return defs;
  }

  function styleShape(el, selected) {
    el.setAttribute('fill', selected ? '#f2edff' : '#ffffff');
    el.setAttribute('stroke', selected ? '#8b5cf6' : '#1f2937');
    el.setAttribute('stroke-width', selected ? '5' : '3');
  }

  function shapeEl(node, selected) {
    var w = node.w, h = node.h, el;
    if (node.type === 'start-end') {
      el = document.createElementNS(NS, 'ellipse');
      el.setAttribute('cx', w / 2); el.setAttribute('cy', h / 2);
      el.setAttribute('rx', w / 2 - 2); el.setAttribute('ry', h / 2 - 2);
    } else if (node.type === 'io') {
      var skew = w * 0.18;
      var pts = [[skew, 0], [w, 0], [w - skew, h], [0, h]].map(function (p) { return p.join(','); }).join(' ');
      el = document.createElementNS(NS, 'polygon');
      el.setAttribute('points', pts);
    } else if (node.type === 'decision') {
      var dpts = [[w / 2, 2], [w - 2, h / 2], [w / 2, h - 2], [2, h / 2]].map(function (p) { return p.join(','); }).join(' ');
      el = document.createElementNS(NS, 'polygon');
      el.setAttribute('points', dpts);
    } else {
      el = document.createElementNS(NS, 'rect');
      el.setAttribute('x', 2); el.setAttribute('y', 2);
      el.setAttribute('width', w - 4); el.setAttribute('height', h - 4);
      el.setAttribute('rx', 8);
    }
    styleShape(el, selected);
    return el;
  }

  function buildNodeEl(node) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'fc-node');
    g.setAttribute('data-id', node.id);
    g.setAttribute('transform', 'translate(' + (node.x - node.w / 2) + ',' + (node.y - node.h / 2) + ')');
    g.style.cursor = 'pointer';

    g.appendChild(shapeEl(node, node.id === connectFrom || node.id === editingNodeId));

    if (node.id !== editingNodeId) {
      // 편집 중인 기호는 텍스트를 그리지 않는다 — 바로 위에 입력창이 덮고 있기 때문이다.
      var fontSize = 15;
      var lines = wrapLines(node.text, node.w, fontSize);
      var text = document.createElementNS(NS, 'text');
      text.setAttribute('x', node.w / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', String(fontSize));
      text.setAttribute('font-weight', '700');
      text.setAttribute('fill', '#1f2937');
      text.setAttribute('pointer-events', 'none');

      if (!lines.length) {
        var ph = document.createElementNS(NS, 'tspan');
        ph.setAttribute('x', node.w / 2);
        ph.setAttribute('y', node.h / 2 + fontSize * 0.35);
        ph.setAttribute('fill', '#b7bfca');
        ph.setAttribute('font-weight', '500');
        ph.textContent = '(눌러서 입력)';
        text.appendChild(ph);
      } else {
        var lineHeight = fontSize * 1.25;
        var startY = node.h / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
        lines.forEach(function (ln, i) {
          var tspan = document.createElementNS(NS, 'tspan');
          tspan.setAttribute('x', node.w / 2);
          tspan.setAttribute('y', startY + i * lineHeight);
          tspan.textContent = ln;
          text.appendChild(tspan);
        });
      }
      g.appendChild(text);
    }
    return g;
  }

  function buildEdgeEl(edge) {
    var from = findNode(edge.from), to = findNode(edge.to);
    if (!from || !to) return document.createComment('orphan-edge');
    var dx = to.x - from.x, dy = to.y - from.y;
    var p1 = boundaryPoint(from, dx, dy);
    var p2 = boundaryPoint(to, -dx, -dy);

    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'fc-edge');

    var hit = document.createElementNS(NS, 'line');
    hit.setAttribute('class', 'fc-edge-hit');
    hit.setAttribute('data-id', edge.id);
    hit.setAttribute('x1', p1.x); hit.setAttribute('y1', p1.y);
    hit.setAttribute('x2', p2.x); hit.setAttribute('y2', p2.y);
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '18');
    hit.style.cursor = mode === 'delete' ? 'pointer' : 'default';
    g.appendChild(hit);

    var line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', '#1f2937');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('marker-end', 'url(#fc-arrow)');
    line.setAttribute('pointer-events', 'none');
    g.appendChild(line);

    if (edge.label) {
      var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      var len = Math.hypot(dx, dy) || 1;
      var ox = -dy / len * 16, oy = dx / len * 16;
      var lx = mx + ox, ly = my + oy;
      var w = edge.label.length * 13 + 14;
      var isYes = edge.label === '예';

      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', lx - w / 2); rect.setAttribute('y', ly - 13);
      rect.setAttribute('width', w); rect.setAttribute('height', 26);
      rect.setAttribute('rx', 8);
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', isYes ? '#12b886' : '#e8434f');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('pointer-events', 'none');
      g.appendChild(rect);

      var label = document.createElementNS(NS, 'text');
      label.setAttribute('x', lx); label.setAttribute('y', ly + 1);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '16');
      label.setAttribute('font-weight', '800');
      label.setAttribute('fill', isYes ? '#0d8f68' : '#c62330');
      label.setAttribute('pointer-events', 'none');
      label.textContent = edge.label;
      g.appendChild(label);
    }
    return g;
  }

  function renderSvg() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.appendChild(buildDefs());
    edges.forEach(function (edge) { svg.appendChild(buildEdgeEl(edge)); });
    nodes.forEach(function (node) { svg.appendChild(buildNodeEl(node)); });
  }

  function render() {
    renderSvg();
    updatePaletteActiveStates();
  }

  /* ═══════════════════════════════════════════
     캔버스 크기 조절 — 오른쪽 아래 모서리를 드래그
     ═══════════════════════════════════════════ */
  function applyCanvasSize() {
    svg.setAttribute('viewBox', '0 0 ' + VBOX_W + ' ' + VBOX_H);
    svg.setAttribute('width', VBOX_W);
    svg.setAttribute('height', VBOX_H);
    renderSvg(); // 기존 기호의 x/y 는 그대로 — 캔버스 크기만 달라진다
  }

  (function setupCanvasResize() {
    var handle = $('#canvas-resize-handle');
    var resizeState = null;

    handle.addEventListener('pointerdown', function (evt) {
      resizeState = { startX: evt.clientX, startY: evt.clientY, startW: VBOX_W, startH: VBOX_H };
      if (handle.setPointerCapture) handle.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    });
    handle.addEventListener('pointermove', function (evt) {
      if (!resizeState) return;
      VBOX_W = clamp(resizeState.startW + (evt.clientX - resizeState.startX), MIN_VBOX_W, MAX_VBOX_W);
      VBOX_H = clamp(resizeState.startH + (evt.clientY - resizeState.startY), MIN_VBOX_H, MAX_VBOX_H);
      applyCanvasSize();
    });
    handle.addEventListener('pointerup', function (evt) {
      if (!resizeState) return;
      resizeState = null;
      save();
    });
    handle.addEventListener('pointercancel', function () { resizeState = null; save(); });
  })();

  /* ═══════════════════════════════════════════
     캔버스 위에서 바로 입력 — 별도 대화상자 없이 기호 위에 입력창을 띄운다.
     ═══════════════════════════════════════════ */
  function positionInlineEditor(ta, node) {
    var rect = svg.getBoundingClientRect();
    var scale = rect.width / VBOX_W;
    ta.style.left = (rect.left + (node.x - node.w / 2) * scale) + 'px';
    ta.style.top = (rect.top + (node.y - node.h / 2) * scale) + 'px';
    ta.style.width = (node.w * scale) + 'px';
    ta.style.height = (node.h * scale) + 'px';
    ta.style.fontSize = Math.max(11, 15 * scale) + 'px';
  }

  function repositionInlineEditor() {
    if (!inlineEditorEl || !editingNodeId) return;
    var node = findNode(editingNodeId);
    if (!node) return;
    positionInlineEditor(inlineEditorEl, node);
  }
  window.addEventListener('scroll', repositionInlineEditor, true);
  window.addEventListener('resize', repositionInlineEditor);

  function openInlineEditor(node, skipHistory) {
    // skipHistory: 방금 놓은 기호에 자동으로 입력창을 열 때 쓴다 — "놓기"가 이미 되돌리기 한 단계를
    // 기록했으므로, 이어지는 이름 입력까지 또 한 단계로 셀 필요가 없다(놓기+입력을 한 동작으로 취급).
    if (inlineEditorEl) return; // 이미 다른 기호를 편집 중이면(닫히는 중) 새로 열지 않는다
    var beforeEdit = skipHistory ? null : snapshotState(); // 되돌리기용 — 편집 시작 전 상태
    var originalText = node.text || '';
    editingNodeId = node.id;
    render(); // 원래 텍스트를 가려서 입력창과 겹쳐 보이지 않게 한다

    var ta = document.createElement('textarea');
    ta.className = 'fc-inline-editor';
    ta.value = node.text || '';
    positionInlineEditor(ta, node);
    document.body.appendChild(ta);
    inlineEditorEl = ta;
    ta.focus();
    ta.select();

    var done = false;
    function finish(commit) {
      if (done) return;
      done = true;
      if (commit) {
        node.text = ta.value;
        if (!skipHistory && node.text !== originalText) pushHistory(beforeEdit);
      }
      ta.removeEventListener('blur', onBlur);
      ta.remove();
      inlineEditorEl = null;
      editingNodeId = null;
      render();
      save();
    }
    function onBlur() { finish(true); }
    ta.addEventListener('blur', onBlur);
    ta.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') { evt.preventDefault(); finish(false); }
      else if (evt.key === 'Enter' && !evt.shiftKey) { evt.preventDefault(); finish(true); }
    });
  }

  /* ═══════════════════════════════════════════
     캔버스 조작 — 기본 모드·배치 모드는 포인터로 드래그/편집, 연결·삭제 모드는 클릭
     ═══════════════════════════════════════════ */
  svg.addEventListener('pointerdown', function (evt) {
    if (mode === 'connect' || mode === 'delete') return;
    if (dragState) return; // 이미 다른 손가락/포인터로 드래그 중이면 새 드래그를 시작하지 않는다
    var g = evt.target.closest ? evt.target.closest('.fc-node') : null;
    if (!g) return; // 빈 캔버스는 click 이벤트에서 처리한다(배치 모드일 때 새 기호 놓기)
    var node = findNode(g.dataset.id);
    if (!node) return;
    dragState = {
      pointerId: evt.pointerId, id: node.id, moved: false,
      startPt: toSvgPoint(evt), startX: node.x, startY: node.y,
      beforeMove: snapshotState(), // 되돌리기용 — 드래그가 실제로 일어났을 때만 쓴다
    };
    if (svg.setPointerCapture) svg.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });

  svg.addEventListener('pointermove', function (evt) {
    if (!dragState || evt.pointerId !== dragState.pointerId) return;
    var node = findNode(dragState.id);
    if (!node) { dragState = null; return; }
    var p = toSvgPoint(evt);
    var dx = p.x - dragState.startPt.x, dy = p.y - dragState.startPt.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true;
    node.x = clamp(dragState.startX + dx, node.w / 2, VBOX_W - node.w / 2);
    node.y = clamp(dragState.startY + dy, node.h / 2, VBOX_H - node.h / 2);
    renderSvg();
  });

  svg.addEventListener('pointerup', function (evt) {
    if (!dragState || evt.pointerId !== dragState.pointerId) return;
    var id = dragState.id, moved = dragState.moved, beforeMove = dragState.beforeMove;
    dragState = null;
    if (!moved) {
      var node = findNode(id);
      if (node) openInlineEditor(node);
    } else {
      pushHistory(beforeMove);
      save();
    }
  });

  svg.addEventListener('pointercancel', function (evt) {
    if (!dragState || evt.pointerId !== dragState.pointerId) return;
    var moved = dragState.moved, beforeMove = dragState.beforeMove;
    dragState = null;
    if (moved) pushHistory(beforeMove); // 취소된 시점까지의 위치를 그대로 확정한다 (드래그를 되돌리지 않음)
    save();
  });

  svg.addEventListener('click', function (evt) {
    if (mode === null) return; // 기본 모드는 pointerup에서 이미 처리했다

    var g = evt.target.closest ? evt.target.closest('.fc-node') : null;
    var edgeHit = evt.target.closest ? evt.target.closest('.fc-edge-hit') : null;

    if (mode.indexOf('place:') === 0) {
      // 이미 놓은 기호를 눌렀다면 pointerdown/up 쪽에서 드래그·편집으로 이미 처리했다.
      if (g) return;
      var type = mode.slice(6);
      var pt = toSvgPoint(evt);
      var size = FC.NODE_SIZE[type];
      var x = clamp(pt.x, size.w / 2, VBOX_W - size.w / 2);
      var y = clamp(pt.y, size.h / 2, VBOX_H - size.h / 2);
      pushHistory();
      var node = FC.createNode(type, x, y, '');
      nodes.push(node);
      render(); save();
      openInlineEditor(node, true); // 놓자마자 바로 입력할 수 있게 입력창을 연다 (되돌리기는 "놓기" 한 단계로 합침)
      return;
    }

    if (mode === 'connect') {
      if (edgeHit || !g) return;
      var id = g.dataset.id;
      if (connectFrom === null) {
        connectFrom = id;
        updateModeIndicator();
        render();
        return;
      }
      if (id === connectFrom) {
        connectFrom = null;
        updateModeIndicator();
        render();
        return;
      }
      var sourceNode = findNode(connectFrom);
      var label = null;
      if (sourceNode && sourceNode.type === 'decision') {
        var used = FC.decisionEdgeLabels(edges, connectFrom);
        if (used.length >= 2) {
          alert('판단 기호에는 화살표를 2개까지만 연결할 수 있어요 (예/아니요).');
          connectFrom = null;
          updateModeIndicator();
          render();
          return;
        }
        if (used.length === 0) {
          var isYes = confirm("이 화살표는 조건을 만족했을 때('예') 방향인가요?\n확인 = 예, 취소 = 아니요");
          label = isYes ? '예' : '아니요';
        } else {
          label = used[0] === '예' ? '아니요' : '예';
        }
      }
      pushHistory();
      edges.push(FC.createEdge(connectFrom, id, label));
      connectFrom = null;
      updateModeIndicator();
      render(); save();
      return;
    }

    if (mode === 'delete') {
      if (edgeHit) {
        pushHistory();
        edges = FC.removeEdge(edges, edgeHit.dataset.id);
        render(); save();
        return;
      }
      if (g) {
        pushHistory();
        var res = FC.removeNode(nodes, edges, g.dataset.id);
        nodes = res.nodes; edges = res.edges;
        render(); save();
        return;
      }
    }
  });

  /* ═══════════════════════════════════════════
     점검하기
     ═══════════════════════════════════════════ */
  $('#btn-check').addEventListener('click', function () {
    var result = FC.validate(nodes, edges);
    var box = $('#check-feedback');
    var errors = result.issues.filter(function (i) { return i.level === 'error'; });
    var warns = result.issues.filter(function (i) { return i.level === 'warn'; });
    var html = '';
    if (result.ok) {
      html += '<p>🎉 <b>순서도가 올바르게 완성됐어요!</b></p>';
    } else {
      html += '<p>🔧 <b>아직 고칠 부분이 있어요.</b></p>';
      html += '<ul>' + errors.map(function (i) { return '<li class="issue-error">' + escapeHtml(i.message) + '</li>'; }).join('') + '</ul>';
    }
    if (warns.length) {
      html += '<p style="margin-top:10px">💡 이런 점도 확인해 보세요.</p>';
      html += '<ul>' + warns.map(function (i) { return '<li class="issue-warn">' + escapeHtml(i.message) + '</li>'; }).join('') + '</ul>';
    }
    box.classList.remove('hidden', 'is-ok', 'is-bad');
    box.classList.add(result.ok ? 'is-ok' : 'is-bad');
    box.innerHTML = html;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* ═══════════════════════════════════════════
     그림으로 저장 (SVG → PNG)
     ═══════════════════════════════════════════ */
  $('#btn-export-png').addEventListener('click', function () {
    if (!nodes.length) { alert('아직 그린 것이 없어요. 순서도를 먼저 그려 보세요.'); return; }
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', NS);
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', VBOX_W); bg.setAttribute('height', VBOX_H);
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    var svgStr = new XMLSerializer().serializeToString(clone);
    var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      var scale = 2;
      var canvas = document.createElement('canvas');
      canvas.width = VBOX_W * scale; canvas.height = VBOX_H * scale;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (pngBlob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(pngBlob);
        a.download = '순서도.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert('그림으로 저장하는 데 문제가 생겼어요. 다시 시도해 주세요.');
    };
    img.src = url;
  });

  /* ═══════════════════════════════════════════
     3단계 — 알고리즘 설계 (순서도 → 의사코드)

     그래프를 따라가는 계산은 algorithm-core.js 의 buildOutline() 이 맡는다.
     여기서는 그 결과(steps)를 화면에 채울 칸으로 그리고, 학생이 쓴 내용을
     algoAnswers 에 모으고, 미리보기 텍스트를 조립하는 일만 한다.

     들여쓰기 규칙: buildOutline() 이 주는 depth 는 "판단에서 몇 단계 안쪽 가지인가"를
     뜻한다. 가지 이름표('branch' 종류)는 그 가지의 내용보다 한 단계 얕게(depth-1) 그려서
     "그렇다면:" 표가 판단 기호와 같은 줄 높이에, 그 안의 내용은 한 단 들여써 보이게 한다.
     ═══════════════════════════════════════════ */
  var ALGO_ICONS = { 'start-end': '⬭', 'io': '▱', 'process': '▭', 'decision': '◇' };
  var ALGO_INDENT_PX = 26;

  function algoRenderDepth(step) {
    return step.kind === 'branch' ? Math.max(0, step.depth - 1) : step.depth;
  }

  function algoPlaceholder(nodeType) {
    if (nodeType === 'decision') return '예: 만약 (투입한 금액이 가격보다 크거나 같으면)';
    if (nodeType === 'start-end') return '예: 시작한다 / 끝낸다';
    if (nodeType === 'io') return '예: 금액을 입력받는다';
    return '예: 재고를 1 줄인다';
  }

  /** algoSteps + algoAnswers 로 의사코드 미리보기 문자열을 만든다. 글로 저장 내보내기도 이걸 그대로 쓴다. */
  function buildPseudocodeText() {
    return algoSteps.map(function (step) {
      var pad = '  '.repeat(algoRenderDepth(step));
      if (step.kind === 'node') {
        var text = (algoAnswers[step.nodeId] || '').trim();
        return pad + (text || '(아직 안 썼어요)');
      }
      if (step.kind === 'branch') {
        return pad + (step.label === '예' ? '그렇다면(예):' : '아니면(아니요):');
      }
      if (step.kind === 'loop') {
        return pad + '(다시 스텝 ' + (step.targetStepIndex + 1) + '로 돌아가서 반복)';
      }
      if (step.kind === 'merge') {
        return pad + '(스텝 ' + (step.targetStepIndex + 1) + '부터는 같은 내용으로 이어짐)';
      }
      return '';
    }).join('\n');
  }

  function updateAlgoPreview() {
    $('#algo-preview').textContent = buildPseudocodeText();
  }

  function renderAlgoOutline() {
    var result = FC.validate(nodes, edges);
    var ready = result.ok && nodes.length > 0;
    $('#algo-not-ready').classList.toggle('hidden', ready);
    $('#algo-body').classList.toggle('hidden', !ready);
    if (!ready) { algoSteps = []; return; }

    var outline = AC.buildOutline(nodes, edges);
    algoSteps = outline.steps;

    var host = $('#algo-outline');
    host.innerHTML = '';

    algoSteps.forEach(function (step) {
      var marginLeft = algoRenderDepth(step) * ALGO_INDENT_PX;

      if (step.kind === 'node') {
        var node = findNode(step.nodeId);
        if (!node) return;
        var refText = (node.text && node.text.trim()) ? node.text.trim() : '(내용 없음)';

        var row = document.createElement('div');
        row.className = 'algo-step';
        row.style.marginLeft = marginLeft + 'px';
        row.innerHTML =
          '<div class="algo-step-icon">' + (ALGO_ICONS[node.type] || '▭') + '</div>' +
          '<div class="algo-step-main">' +
            '<p class="algo-step-ref"><b>스텝 ' + (step.stepIndex + 1) + ' · [' + FC.NODE_LABELS[node.type] + ']</b> ' + escapeHtml(refText) + '</p>' +
          '</div>';

        var ta = document.createElement('textarea');
        ta.className = 'algo-step-input';
        ta.rows = 1;
        ta.placeholder = algoPlaceholder(node.type);
        ta.value = algoAnswers[node.id] || '';
        if (ta.value.trim()) row.classList.add('is-filled');
        ta.addEventListener('input', function (e) {
          algoAnswers[node.id] = e.target.value;
          row.classList.toggle('is-filled', !!e.target.value.trim());
          updateAlgoPreview();
          save();
        });
        row.querySelector('.algo-step-main').appendChild(ta);
        host.appendChild(row);
        return;
      }

      if (step.kind === 'branch') {
        var label = document.createElement('div');
        label.className = 'algo-branch-label';
        label.style.marginLeft = marginLeft + 'px';
        label.textContent = step.label === '예' ? '▸ 그렇다면 (예):' : '▸ 아니면 (아니요):';
        host.appendChild(label);
        return;
      }

      var marker = document.createElement('div');
      marker.className = 'algo-marker';
      marker.style.marginLeft = marginLeft + 'px';
      marker.textContent = step.kind === 'loop'
        ? '↻ 다시 스텝 ' + (step.targetStepIndex + 1) + '로 돌아가서 반복해요.'
        : '↘ 스텝 ' + (step.targetStepIndex + 1) + '부터는 같은 내용으로 이어져요.';
      host.appendChild(marker);
    });

    updateAlgoPreview();
  }

  $('#btn-algo-check').addEventListener('click', function () {
    var result = AC.checkAnswers(algoSteps, algoAnswers);
    var box = $('#algo-feedback');
    box.classList.remove('hidden', 'is-ok', 'is-bad');
    if (result.ok) {
      box.classList.add('is-ok');
      box.innerHTML = '<p>🎉 <b>모든 기호에 의사코드를 다 썼어요!</b></p>';
    } else {
      box.classList.add('is-bad');
      var items = result.missing.map(function (nodeId) {
        var node = findNode(nodeId);
        var label = node ? (node.text && node.text.trim() ? node.text.trim() : ('(내용 없음 · ' + FC.NODE_LABELS[node.type] + ')')) : nodeId;
        return '<li class="issue-error">\'' + escapeHtml(label) + '\' 기호에 아직 의사코드를 안 썼어요.</li>';
      }).join('');
      box.innerHTML = '<p>🔧 <b>아직 빈 칸이 있어요.</b></p><ul>' + items + '</ul>';
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  /* PDF로 저장 — 외부 라이브러리 없이 브라우저의 인쇄 기능을 쓴다.
     #print-report 를 채운 뒤 window.print() 를 부르면, 사용자가 프린터 목록에서
     "PDF로 저장"을 골라 파일로 받는다. (앱 CLAUDE.md 의 "PDF로 저장" 절 참고) */
  $('#btn-algo-pdf').addEventListener('click', function () {
    if (!algoSteps.length) { alert('아직 저장할 내용이 없어요. 2단계를 먼저 완성해 주세요.'); return; }

    // 학번·이름을 안 썼으면 한 번만 물어본다 (막지는 않는다 — 이름 없이 뽑고 싶을 수도 있다)
    if (!studentId.trim() && !studentName.trim()) {
      if (!confirm('1단계에 학번과 이름을 쓰지 않았어요.\n이름 없이 PDF를 만들까요?\n\n(취소를 누르면 1단계로 가서 쓸 수 있어요)')) {
        goToTab('define');
        $('#input-student-id').focus();
        return;
      }
    }

    var sc = findScenario(scenarioId);
    $('#print-title').textContent = '문제 정의와 알고리즘 설계'
      + (sc && !sc.custom ? ' — ' + sc.title : '');

    // 학번·이름은 보고서 머리말에만 넣는다. 둘 다 비었으면 그 줄을 아예 감춘다.
    var who = [studentId.trim(), studentName.trim()].filter(Boolean).join('  ');
    var whoEl = $('#print-student');
    whoEl.textContent = who;
    whoEl.style.display = who ? '' : 'none';

    $('#print-situation').textContent = situationText || '(문제 상황을 쓰지 않았어요)';

    $('#print-definition').innerHTML =
      '<dt>해결해야 할 문제</dt><dd>' + (escapeHtml(problem) || '(안 썼어요)') + '</dd>' +
      '<dt>초기 상태</dt><dd>' + (escapeHtml(initial) || '(안 썼어요)') + '</dd>' +
      '<dt>목표 상태</dt><dd>' + (escapeHtml(goal) || '(안 썼어요)') + '</dd>';

    // 순서도는 화면의 SVG를 복사해 넣는다. 인쇄에서는 배경이 흰색이어야 하므로 흰 사각형을 깔아 준다.
    var clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('xmlns', NS);
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0);
    bg.setAttribute('width', VBOX_W); bg.setAttribute('height', VBOX_H);
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    var host = $('#print-flowchart');
    host.innerHTML = '';
    host.appendChild(clone);

    $('#print-pseudocode').textContent = buildPseudocodeText();

    window.print();
  });

  /* ═══════════════════════════════════════════
     시작
     ═══════════════════════════════════════════ */
  load();
  renderScenarioCards();
  applySituationDisplay();
  $('#input-problem').value = problem;
  $('#input-initial').value = initial;
  $('#input-goal').value = goal;
  applyCanvasSize(); // 저장된 캔버스 크기를 SVG에 반영 (기본값이면 1100x650 그대로)
  updatePaletteActiveStates();
  updateModeIndicator();
  updateUndoRedoButtons();
})();
