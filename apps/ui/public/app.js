const state = {
  sessions: [],
  selectedSessionId: null
};

const elements = {
  sessionList: document.querySelector("#sessionList"),
  refreshSessions: document.querySelector("#refreshSessions"),
  workspaceTitle: document.querySelector("#workspaceTitle"),
  healthSummary: document.querySelector("#healthSummary"),
  selectedSessionLabel: document.querySelector("#selectedSessionLabel"),
  sessionDetail: document.querySelector("#sessionDetail"),
  explainDetail: document.querySelector("#explainDetail"),
  compareForm: document.querySelector("#compareForm"),
  compareLeft: document.querySelector("#compareLeft"),
  compareRight: document.querySelector("#compareRight"),
  compareResult: document.querySelector("#compareResult"),
  blameForm: document.querySelector("#blameForm"),
  blameFile: document.querySelector("#blameFile"),
  blameLine: document.querySelector("#blameLine"),
  blameResult: document.querySelector("#blameResult"),
  importForm: document.querySelector("#importForm"),
  importPayload: document.querySelector("#importPayload"),
  importResult: document.querySelector("#importResult")
};

boot().catch((error) => {
  elements.sessionDetail.textContent = error.message;
});

elements.refreshSessions.addEventListener("click", () => {
  void loadSessions();
});

elements.compareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void runCompare();
});

elements.blameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void runBlame();
});

elements.importForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void runImport();
});

async function boot() {
  await loadHealth();
  await loadSessions();
}

async function loadHealth() {
  const health = await fetchJson("/api/health");
  elements.workspaceTitle.textContent = health.workspaceDir;
  elements.healthSummary.innerHTML = "";

  for (const check of health.doctor.checks) {
    const chip = document.createElement("span");
    chip.className = `chip ${check.ok ? "chip-ok" : "chip-bad"}`;
    chip.textContent = check.label;
    elements.healthSummary.append(chip);
  }
}

async function loadSessions() {
  const payload = await fetchJson("/api/sessions");
  state.sessions = payload.sessions;
  if (!state.selectedSessionId && state.sessions.length > 0) {
    state.selectedSessionId = state.sessions[0].id;
  }

  renderSessionList();
  renderCompareSelects();

  if (state.selectedSessionId) {
    await loadSessionDetail(state.selectedSessionId);
  }
}

function renderSessionList() {
  elements.sessionList.innerHTML = "";

  if (state.sessions.length === 0) {
    elements.sessionList.textContent = "No sessions recorded yet.";
    return;
  }

  for (const session of state.sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `session-card ${session.id === state.selectedSessionId ? "session-card-active" : ""}`;
    button.innerHTML = `
      <strong>${escapeHtml(session.task)}</strong>
      <span>${escapeHtml(session.id)}</span>
      <span>${escapeHtml(session.createdAt)}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedSessionId = session.id;
      renderSessionList();
      void loadSessionDetail(session.id);
    });
    elements.sessionList.append(button);
  }
}

function renderCompareSelects() {
  const options = state.sessions
    .map((session) => `<option value="${escapeHtml(session.id)}">${escapeHtml(session.task)} (${escapeHtml(session.id)})</option>`)
    .join("");

  elements.compareLeft.innerHTML = options;
  elements.compareRight.innerHTML = options;

  if (state.sessions.length >= 1) {
    elements.compareLeft.value = state.sessions[0].id;
  }
  if (state.sessions.length >= 2) {
    elements.compareRight.value = state.sessions[1].id;
  } else if (state.sessions.length === 1) {
    elements.compareRight.value = state.sessions[0].id;
  }
}

async function loadSessionDetail(sessionId) {
  const [sessionPayload, explainPayload] = await Promise.all([
    fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}`),
    fetchJson(`/api/explain/${encodeURIComponent(sessionId)}`)
  ]);

  elements.selectedSessionLabel.textContent = sessionId;
  elements.sessionDetail.textContent = JSON.stringify(sessionPayload.session, null, 2);
  elements.explainDetail.textContent = JSON.stringify(explainPayload.report, null, 2);
}

async function runCompare() {
  const left = elements.compareLeft.value;
  const right = elements.compareRight.value;
  if (!left || !right) {
    elements.compareResult.textContent = "Choose two sessions first.";
    return;
  }

  const payload = await fetchJson(
    `/api/compare?left=${encodeURIComponent(left)}&right=${encodeURIComponent(right)}`
  );
  elements.compareResult.textContent = JSON.stringify(payload.report, null, 2);
}

async function runBlame() {
  const file = elements.blameFile.value.trim();
  const line = Number.parseInt(elements.blameLine.value, 10);
  if (!file || !Number.isInteger(line) || line <= 0) {
    elements.blameResult.textContent = "Enter a file path and a positive line number.";
    return;
  }

  const payload = await fetchJson(
    `/api/blame?file=${encodeURIComponent(file)}&line=${encodeURIComponent(line)}`
  );
  elements.blameResult.textContent = JSON.stringify(payload.report, null, 2);
}

async function runImport() {
  const raw = elements.importPayload.value.trim();
  if (!raw) {
    elements.importResult.textContent = "Paste an export payload first.";
    return;
  }

  const payload = await fetchJson("/api/import", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: raw
  });

  elements.importResult.textContent = JSON.stringify(payload.result, null, 2);
  await loadSessions();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
