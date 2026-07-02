// 독해 지문 분석기 프론트엔드 (바닐라 JS)
const $ = (sel) => document.querySelector(sel);

const views = {
  input: $("#view-input"),
  progress: $("#view-progress"),
  result: $("#view-result"),
};

let currentRecord = null;
let analyzing = false;

function showView(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s == null ? "" : String(s);
  return div.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---- 목록 ----

async function refreshList() {
  const res = await fetch("/api/analyses");
  const { analyses } = await res.json();
  const box = $("#analysis-list");
  if (!analyses.length) {
    box.innerHTML = '<div class="list-empty">저장된 분석이 없습니다.<br>지문을 붙여 넣고 분석해 보세요!</div>';
    return;
  }
  box.innerHTML = analyses
    .map(
      (a) => `
      <div class="analysis-item${currentRecord && currentRecord.id === a.id ? " active" : ""}" data-id="${a.id}">
        <div class="item-title">${esc(a.title)}</div>
        <div class="item-sub">${esc(a.sourceGuess || "출처 미상")} · ${fmtDate(a.createdAt)}</div>
        <button class="item-delete" data-del="${a.id}" title="삭제">✕</button>
      </div>`
    )
    .join("");
}

$("#analysis-list").addEventListener("click", async (e) => {
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (delId) {
    e.stopPropagation();
    if (!confirm("이 분석을 삭제할까요?")) return;
    await fetch(`/api/analyses/${delId}`, { method: "DELETE" });
    if (currentRecord && currentRecord.id === delId) {
      currentRecord = null;
      showView("input");
    }
    refreshList();
    return;
  }
  const id = e.target.closest(".analysis-item")?.dataset.id;
  if (!id) return;
  const res = await fetch(`/api/analyses/${id}`);
  if (!res.ok) return;
  const { record } = await res.json();
  currentRecord = record;
  renderResult(record);
  refreshList();
});

$("#btn-new").addEventListener("click", () => {
  if (analyzing) return alert("분석이 끝난 뒤에 시작할 수 있습니다.");
  currentRecord = null;
  $("#passage-input").value = "";
  showView("input");
  refreshList();
});

// ---- 분석 실행 (SSE) ----

$("#btn-analyze").addEventListener("click", async () => {
  const passage = $("#passage-input").value.trim();
  if (!passage) return alert("지문을 입력해 주세요.");
  if (analyzing) return;

  analyzing = true;
  $("#btn-analyze").disabled = true;
  $("#progress-status").textContent = "요청을 보내는 중…";
  $("#progress-stream").textContent = "";
  showView("progress");

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passage, useWebSearch: $("#use-web-search").checked }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `서버 오류 (${res.status})`);
    }

    // SSE 수동 파싱 (fetch 스트림)
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !done });

      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const eventMatch = block.match(/^event: (.+)$/m);
        const dataMatch = block.match(/^data: (.+)$/m);
        if (!eventMatch || !dataMatch) continue;
        const data = JSON.parse(dataMatch[1]);
        handleSseEvent(eventMatch[1], data);
      }
    }
  } catch (err) {
    alert("분석 실패: " + err.message);
    showView("input");
  } finally {
    analyzing = false;
    $("#btn-analyze").disabled = false;
  }
});

function handleSseEvent(event, data) {
  if (event === "status") {
    $("#progress-status").textContent = data.message;
  } else if (event === "delta") {
    const pre = $("#progress-stream");
    pre.textContent += data.text;
    pre.scrollTop = pre.scrollHeight;
  } else if (event === "done") {
    currentRecord = data.record;
    renderResult(data.record);
    refreshList();
  } else if (event === "error") {
    alert("분석 실패: " + data.message);
    showView("input");
  }
}

// ---- 결과 렌더링 ----

let activeTab = "source";

function renderResult(record) {
  activeTab = "source";
  $("#result-title").textContent = record.title;
  $("#result-meta").textContent = `${fmtDate(record.createdAt)} · ${record.model}${record.webSearchUsed ? " · 웹 검색 사용" : ""}`;
  document.querySelectorAll("#result-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
  renderTab(record);
  showView("result");
}

$("#result-tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab")?.dataset.tab;
  if (!tab || !currentRecord) return;
  activeTab = tab;
  document.querySelectorAll("#result-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  renderTab(currentRecord);
});

function renderTab(record) {
  const body = $("#result-body");
  const r = record.result;

  if (activeTab === "passage") {
    body.innerHTML = `<div class="card"><div class="passage-text">${esc(record.passage)}</div></div>`;
    return;
  }

  // JSON 파싱에 실패한 기록은 모델 원문을 그대로 보여준다
  if (!r) {
    body.innerHTML = `<div class="card"><h3>구조화 실패 — 모델 원문 응답</h3><div class="raw-fallback">${esc(record.rawText || "(응답 없음)")}</div></div>`;
    return;
  }

  if (activeTab === "source") {
    const s = r.source || {};
    const conf = ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "low";
    const confKo = { high: "신뢰도 높음", medium: "신뢰도 중간", low: "신뢰도 낮음" }[conf];
    body.innerHTML = `
      <div class="card">
        <h3>출처 추정 <span class="badge ${conf}">${confKo}</span></h3>
        <p><strong>${esc(s.guess || "미상")}</strong></p>
        ${s.originalWork ? `<p>원문: ${esc(s.originalWork)}</p>` : ""}
        <p class="hint">근거: ${esc(s.evidence || "-")}</p>
      </div>`;
  } else if (activeTab === "analysis") {
    const a = r.analysis || {};
    const rows = (a.structure || [])
      .map((st) => `<tr><th>${esc(st.part)}</th><td>${esc(st.role)}</td><td>${esc(st.summaryKo)}</td></tr>`)
      .join("");
    body.innerHTML = `
      <div class="card"><h3>주제</h3><p>${esc(a.topicKo || "-")}</p></div>
      <div class="card"><h3>요지</h3><p>${esc(a.mainIdea || "-")}</p></div>
      ${rows ? `<div class="card"><h3>전개 구조</h3><table class="struct"><tr><th>구간</th><th>역할</th><th>내용</th></tr>${rows}</table></div>` : ""}
      <div class="card"><h3>난이도</h3><p>${esc(a.difficulty || "-")}</p></div>
      ${a.translationKo ? `<div class="card"><h3>전문 해석</h3><p style="white-space:pre-wrap">${esc(a.translationKo)}</p></div>` : ""}`;
  } else if (activeTab === "vocab") {
    const cards = (r.vocab || [])
      .map((v) => {
        const chips = (arr, cls) => (arr || []).map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join("");
        return `
        <div class="vocab-card">
          <div class="word-line"><span class="word">${esc(v.word)}</span><span class="pos">${esc(v.pos || "")}</span></div>
          <div class="meaning">${esc(v.meaningKo || "")}</div>
          ${(v.synonyms || []).length ? `<div class="chip-label">유의어</div><div class="chip-row">${chips(v.synonyms, "")}</div>` : ""}
          ${(v.antonyms || []).length ? `<div class="chip-label">반의어</div><div class="chip-row">${chips(v.antonyms, "anti")}</div>` : ""}
          ${(v.collocations || []).length ? `<div class="chip-label">콜로케이션</div><div class="chip-row">${chips(v.collocations, "collo")}</div>` : ""}
          ${v.exampleFromPassage ? `<div class="example">${esc(v.exampleFromPassage)}</div>` : ""}
          ${v.note ? `<div class="note">💡 ${esc(v.note)}</div>` : ""}
        </div>`;
      })
      .join("");
    body.innerHTML = cards ? `<div class="vocab-grid">${cards}</div>` : '<div class="card"><p>어휘 데이터가 없습니다.</p></div>';
  } else if (activeTab === "teaching") {
    const cards = (r.teachingPoints || [])
      .map((t) => `<div class="card"><h3>${esc(t.title)}</h3><p style="white-space:pre-wrap">${esc(t.detailKo)}</p></div>`)
      .join("");
    body.innerHTML = cards || '<div class="card"><p>수업 포인트가 없습니다.</p></div>';
  } else if (activeTab === "strategy") {
    const cards = (r.questionStrategy || [])
      .map((q) => `<div class="card"><h3>${esc(q.questionType)}</h3><p style="white-space:pre-wrap">${esc(q.approachKo)}</p></div>`)
      .join("");
    body.innerHTML = cards || '<div class="card"><p>풀이 요령 데이터가 없습니다.</p></div>';
  }
}

// ---- 설정 ----

async function openSettings() {
  const res = await fetch("/api/settings");
  const cfg = await res.json();
  $("#setting-api-key").value = "";
  $("#setting-key-status").textContent = cfg.hasKey
    ? `현재 키: ${cfg.keyPreview}${cfg.keyFromEnv ? " (환경변수에서 읽음 - 여기서 변경 불가)" : ""}`
    : "등록된 키가 없습니다. console.anthropic.com 에서 발급받으세요.";
  const sel = $("#setting-model");
  sel.innerHTML = cfg.allowedModels
    .map((m) => `<option value="${m}"${m === cfg.model ? " selected" : ""}>${m === "claude-opus-4-8" ? "Claude Opus 4.8 (최고 품질)" : "Claude Sonnet 5 (저렴)"}</option>`)
    .join("");
  $("#settings-modal").hidden = false;
}

$("#btn-settings").addEventListener("click", openSettings);
$("#btn-settings-cancel").addEventListener("click", () => ($("#settings-modal").hidden = true));
$("#settings-modal").addEventListener("click", (e) => {
  if (e.target.id === "settings-modal") $("#settings-modal").hidden = true;
});

$("#btn-settings-save").addEventListener("click", async () => {
  const apiKey = $("#setting-api-key").value.trim();
  const body = { model: $("#setting-model").value };
  if (apiKey) body.apiKey = apiKey; // 비워두면 기존 키 유지
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    $("#settings-modal").hidden = true;
  } else {
    alert("저장에 실패했습니다.");
  }
});

// ---- 초기화 ----

(async function init() {
  await refreshList();
  const res = await fetch("/api/settings");
  const cfg = await res.json();
  if (!cfg.hasKey) openSettings(); // 첫 실행이면 설정부터 안내
})();
