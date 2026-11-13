"use strict";
const el = (id) => document.getElementById(id);
function n(tag, cls, text) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text !== undefined) x.textContent = text;
  return x;
}
let servers = [], serverId = null, tool = null, queryKey = null, fields = {}, lastResponse = "";
let prettyMode = false;
const server = () => servers.find((s) => s.id === serverId);
const schema = () => tool?.inputSchema || { type: "object", properties: {} };
const required = () => schema().required || [];
const allTools = () => servers.reduce((v, s) => v + s.tools.length, 0);
function renderServers() {
  const root = el("servers"); root.replaceChildren();
  const filter = el("serverSearch").value.toLowerCase();
  for (const s of servers.filter((x) => (x.name + " " + x.id + " " + (x.portals || []).map(p => p.name).join(" ")).toLowerCase().includes(filter))
    .sort((a,b) => a.name.localeCompare(b.name, "pl") || a.id.localeCompare(b.id, "pl"))) {
    const b = n("button", "nav-item" + (s.id === serverId ? " active" : ""));
    b.type = "button";
    let status = s.status !== "ready" ? "Serwer: " + s.status :
      s.availableTools ? s.availableTools + "/" + s.tools.length + " dostępnych · " +
        (s.tools.some(t => t.available && t.route === "direct") ? "bezpośrednio" : "portal Lex") :
      s.tools.some(t => t.canAttempt) ? s.tools.length + " narzędzi · połączenie bezpośrednie" :
      s.tools.length + " narzędzi · brak autoryzowanej trasy";
    b.append(n("span", "nav-title", s.name), n("span", "nav-description", status));
    if ((s.portals || []).length) {
      const tags = n("span", "portal-tags");
      for (const portal of s.portals) tags.append(n("span", "portal-tag", portal.name));
      b.append(tags);
    }
    b.addEventListener("click", () => {
      serverId = s.id; tool = null; renderServers(); renderTools(); renderDetail();
    });
    root.append(b);
  }
  el("serverCount").textContent = String(servers.length);
}
function renderTools() {
  const root = el("tools"); root.replaceChildren();
  const s = server();
  const filter = el("toolSearch").value.toLowerCase();
  const items = s ? s.tools.filter((x) => (x.name + " " + (x.description || "")).toLowerCase().includes(filter)) : [];
  for (const t of items) {
    const b = n("button", "nav-item" + (tool === t ? " active" : "") + (t.canAttempt ? "" : " unavailable"));
    b.type = "button";
    b.append(n("span", "nav-title", t.name),
      n("span", "nav-description", (t.available ? "Aktywne · " : t.canAttempt ? "Dostęp bezpośredni · " : "Brak połączenia · ") +
      (t.description || "Bez opisu").slice(0, 150)));
    b.addEventListener("click", () => { tool = t; renderTools(); renderDetail(); });
    root.append(b);
  }
  el("toolCount").textContent = s ? String(s.tools.length) : "0";
}
function fieldType(p) {
  if (Array.isArray(p.type)) return p.type.find((t) => t !== "null") || "string";
  return p.type || (p.enum ? typeof p.enum[0] : "string");
}
function defaultValue(p) {
  if (Object.prototype.hasOwnProperty.call(p, "default")) return p.default;
  if (fieldType(p) === "boolean") return false;
  if (["integer", "number"].includes(fieldType(p))) return Number.isFinite(p.minimum) ? p.minimum : null;
  return "";
}
function argumentsFromFields(validate) {
  const args = {};
  for (const [key, p] of Object.entries(schema().properties || {})) {
    const s = fields[key];
    if (!s || (!s.enabled && !required().includes(key))) continue;
    const type = fieldType(p), v = s.value;
    if (type === "string" && (typeof v !== "string" || !v.trim())) {
      if (validate) throw Error("Podaj wartość parametru " + key);
      continue;
    }
    if (["integer", "number"].includes(type)) {
      if (!Number.isFinite(v) || (type === "integer" && !Number.isInteger(v))) {
        if (validate) throw Error("Podaj poprawną liczbę: " + key);
        continue;
      }
      if ((p.minimum !== undefined && v < p.minimum) || (p.maximum !== undefined && v > p.maximum)) {
        if (validate) throw Error("Parametr poza dozwolonym zakresem: " + key);
        continue;
      }
    }
    if (type === "boolean" && typeof v !== "boolean") {
      if (validate) throw Error("Wybierz Tak/Nie: " + key);
      continue;
    }
    if (Array.isArray(p.enum) && !p.enum.some((x) => Object.is(x, v))) {
      if (validate) throw Error("Wybierz jedną z dostępnych opcji: " + key);
      continue;
    }
    args[key] = v;
  }
  return args;
}
function preview() { el("arguments").textContent = JSON.stringify(argumentsFromFields(false), null, 2); }
function parameterRow(key, p, s) {
  const must = required().includes(key);
  const row = n("div", "parameter"); row.dataset.field = key;
  const heading = n("div", "parameter-heading");
  heading.append(n("span", "parameter-label", key + (must ? " *" : "")));
  const control = n("div", "parameter-controls");
  if (!must) {
    const toggle = n("button", "param-toggle", s.enabled ? "Usuń" : "Dodaj");
    toggle.type = "button";
    function refreshToggle() {
      toggle.textContent = s.enabled ? "Usuń" : "Dodaj";
      toggle.setAttribute("aria-label", (s.enabled ? "Usuń" : "Dodaj") + " parametr " + key);
      toggle.setAttribute("aria-pressed", String(s.enabled));
      control.hidden = !s.enabled;
    }
    toggle.addEventListener("click", () => { s.enabled = !s.enabled; refreshToggle(); preview(); });
    heading.append(toggle); refreshToggle();
  }
  row.append(heading);
  if (p.description) row.append(n("p", "hint parameter-hint", p.description));
  if (Array.isArray(p.enum) || fieldType(p) === "boolean") {
    const choices = Array.isArray(p.enum) ? p.enum : [true, false];
    const group = n("div", "parameter-choices");
    group.setAttribute("role", "group"); group.setAttribute("aria-label", key);
    const buttons = [];
    for (const value of choices) {
      const label = typeof value === "boolean" ? (value ? "Tak" : "Nie") : String(value);
      const btn = n("button", "choice-button", label);
      btn.type = "button"; btn.choiceValue = value;
      btn.setAttribute("aria-pressed", String(Object.is(s.value, value)));
      btn.addEventListener("click", () => {
        s.value = value;
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(Object.is(b.choiceValue, value))));
        preview();
      });
      buttons.push(btn); group.append(btn);
    }
    control.append(group);
  } else if (["integer", "number"].includes(fieldType(p))) {
    const numeric = n("div", "parameter-number");
    const down = n("button", "number-step", "−");
    const input = n("input", "parameter-input");
    const up = n("button", "number-step", "+");
    down.type = up.type = "button";
    down.setAttribute("aria-label", "Zmniejsz parametr " + key);
    up.setAttribute("aria-label", "Zwiększ parametr " + key);
    input.type = "number";
    input.setAttribute("aria-label", key);
    const integer = fieldType(p) === "integer";
    const step = p.multipleOf || (integer ? 1 : 0.1);
    input.step = String(step);
    if (p.minimum !== undefined) input.min = String(p.minimum);
    if (p.maximum !== undefined) input.max = String(p.maximum);
    function setValue(v) {
      if (v !== null) {
        v = Number(v);
        if (Number.isFinite(p.minimum)) v = Math.max(p.minimum, v);
        if (Number.isFinite(p.maximum)) v = Math.min(p.maximum, v);
        if (integer) v = Math.round(v);
        v = Number(v.toFixed(8));
      }
      s.value = v;
      input.value = v === null ? "" : String(v);
      down.disabled = v !== null && Number.isFinite(p.minimum) && v <= p.minimum;
      up.disabled = v !== null && Number.isFinite(p.maximum) && v >= p.maximum;
      preview();
    }
    input.addEventListener("input", () => {
      s.value = input.value === "" ? null : Number(input.value);
      preview();
    });
    down.addEventListener("click", () => setValue((Number.isFinite(s.value) ? s.value : (p.default ?? p.minimum ?? 0)) - step));
    up.addEventListener("click", () => setValue((Number.isFinite(s.value) ? s.value : (p.default ?? p.minimum ?? 0)) + step));
    input.value = s.value === null ? "" : String(s.value);
    numeric.append(down, input, up);
    control.append(numeric);
    if (p.default !== undefined || (p.minimum !== undefined && p.maximum !== undefined)) {
      const presets = n("div", "parameter-choices parameter-presets");
      const options = [
        ["Min", p.minimum],
        ["Domyślnie", p.default],
        ["Max", p.maximum],
      ].filter((x) => typeof x[1] === "number" && Number.isFinite(x[1]));
      for (const [label, value] of options) {
        if (options.findIndex((x) => x[1] === value) !== options.indexOf(options.find((x) => x[0] === label))) continue;
        const btn = n("button", "choice-button", label + ": " + value);
        btn.type = "button";
        btn.addEventListener("click", () => setValue(value));
        presets.append(btn);
      }
      control.append(presets);
    }
  } else {
    const input = n("input", "parameter-input");
    input.type = ["integer", "number"].includes(fieldType(p)) ? "number" : "text";
    input.setAttribute("aria-label", key);
    if (input.type === "number") {
      input.step = fieldType(p) === "integer" ? "1" : "any";
      if (p.minimum !== undefined) input.min = String(p.minimum);
      if (p.maximum !== undefined) input.max = String(p.maximum);
    }
    if (s.value !== null && s.value !== undefined) input.value = String(s.value);
    input.placeholder = key;
    input.addEventListener("input", () => {
      s.value = input.type === "number" ? (input.value === "" ? null : Number(input.value)) : input.value;
      preview();
    });
    control.append(input);
  }
  control.hidden = !s.enabled;
  row.append(control);
  return row;
}
function showResponseMessage(message) {
  el("result").textContent = message;
  el("prettyResult").textContent = message;
}
function applyResultMode() {
  el("result").hidden = prettyMode;
  el("prettyResult").hidden = !prettyMode;
  el("resultMode").textContent = "Widok: " + (prettyMode ? "Pretty" : "RAW JSON");
  el("resultMode").setAttribute("aria-pressed", String(prettyMode));
  el("copy").textContent = prettyMode ? "Kopiuj tekst" : "Kopiuj JSON";
}
function renderDetail() {
  el("detail").hidden = !tool; el("empty").hidden = !!tool;
  if (!tool) return;
  el("selectedServer").textContent = server().name;
  el("selectedTool").textContent = tool.name;
  el("description").textContent = tool.description || "Bez opisu narzędzia";
  el("schema").textContent = JSON.stringify(schema(), null, 2);
  fields = {};
  for (const [key, p] of Object.entries(schema().properties || {}))
    fields[key] = {enabled: required().includes(key), value: defaultValue(p)};
  queryKey = ["query", "question", "search_query", "q", "text", "input", "phrase"].find(
    (key) => fields[key] && fieldType(schema().properties[key]) === "string" &&
      !schema().properties[key].enum) || null;
  el("queryGroup").hidden = !queryKey;
  el("query").value = queryKey ? String(fields[queryKey].value || "") : "";
  el("queryLabel").textContent = queryKey ? "Query: " + queryKey : "Query";
  el("queryHint").textContent = queryKey ? (schema().properties[queryKey].description || "") : "";
  const parent = el("parameters"); parent.replaceChildren();
  for (const [key, p] of Object.entries(schema().properties || {})) {
    if (key !== queryKey) parent.append(parameterRow(key, p, fields[key]));
  }
  const ann = tool.annotations || {};
  el("risk").textContent = !tool.canAttempt ?
    "Brak autoryzowanego połączenia z tym serwerem. Sam wpis w rejestrze Cloudflare nie udostępnia wywołań; konieczna jest autoryzacja MCP lub połączenie z właściwym portalem." :
    !tool.available ? "Próba połączenia bezpośredniego z MCP. Cloudflare Access może wymagać dodatkowej autoryzacji." :
    (ann.readOnlyHint === true && ann.destructiveHint !== true ?
      "Tylko do odczytu · " + (tool.route === "direct" ? "połączenie bezpośrednie" : "portal Lex") :
      "Przed wywołaniem wymagane potwierdzenie");
  el("run").disabled = !tool.canAttempt;
  showResponseMessage("Brak wywołania.");
  el("runtime").textContent = "";
  lastResponse = ""; preview();
}
async function fetchJson(url, options) {
  const r = await fetch(url, {cache: "no-store", ...options});
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "HTTP " + r.status);
  return d;
}
async function refreshCatalog(force) {
  el("status").textContent = "Pobieranie serwerów…";
  el("refresh").disabled = true;
  try {
    const d = await fetchJson("/api/catalog" + (force ? "?refresh=1" : ""));
    servers = Array.isArray(d.servers) ? d.servers : [];
    if (!servers.some((s) => s.id === serverId)) serverId = servers.find(s => s.availableTools > 0)?.id || servers[0]?.id || null;
    tool = null; el("toolSearch").value = "";
    renderServers(); renderTools(); renderDetail();
    const online = d.availableTools || 0;
    const directCount = servers.reduce((sum, s) => sum + s.tools.filter(t => t.available && t.route === "direct").length, 0);
    el("status").textContent = servers.length + " serwerów / " + allTools() +
      " narzędzi w Cloudflare · " + online + " aktywnych (" + (online - directCount) +
      " przez Lex, " + directCount + " bezpośrednio)" +
      (d.snapshot ? " · portal Lex offline" : "") +
      (d.registryCapturedAt ? " · rejestr: " + d.registryCapturedAt : "");
  } catch (e) { el("status").textContent = "Błąd katalogu: " + e.message; }
  finally { el("refresh").disabled = false; }
}
el("query").addEventListener("input", () => {
  if (!queryKey || !fields[queryKey]) return;
  fields[queryKey].value = el("query").value;
  fields[queryKey].enabled = !!el("query").value.trim() || required().includes(queryKey);
  preview();
});
el("toolForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!tool || !tool.canAttempt) return;
  let args;
  try { args = argumentsFromFields(true); }
  catch (e) { lastResponse = ""; showResponseMessage("Błąd parametrów: " + e.message); return; }
  const ann = tool.annotations || {};
  const confirm = ann.readOnlyHint !== true || ann.destructiveHint === true;
  if (confirm && !window.confirm("Wykonać narzędzie " + tool.name + " z podanymi argumentami? Może ono zmienić dane.")) return;
  const start = performance.now(); el("run").disabled = true;
  lastResponse = ""; showResponseMessage("Wywoływanie narzędzia…"); el("runtime").textContent = "";
  try {
    const d = await fetchJson("/api/call", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({serverId:tool.serverId, name:tool.name, arguments:args, confirmed:confirm}),
    });
    lastResponse = JSON.stringify(d.result, null, 2);
    el("result").textContent = lastResponse;
    try { window.MCPPretty.render(d.result, el("prettyResult")); }
    catch { el("prettyResult").textContent = "Nie można sformatować odpowiedzi. Dostępny jest pełny RAW JSON."; }
    el("runtime").textContent = Math.round(performance.now()-start) + " ms · " + (d.result?.isError ? "Błąd narzędzia" : "OK");
  } catch (e) {
    lastResponse = ""; showResponseMessage("Błąd: " + e.message);
    el("runtime").textContent = Math.round(performance.now()-start) + " ms";
  } finally { el("run").disabled = !tool.canAttempt; }
});
el("serverSearch").addEventListener("input", renderServers);
el("toolSearch").addEventListener("input", renderTools);
el("refresh").addEventListener("click", () => refreshCatalog(true));
el("resultMode").addEventListener("click", () => { prettyMode = !prettyMode; applyResultMode(); });
el("copy").addEventListener("click", () => {
  if (!lastResponse) return;
  const text = prettyMode ? el("prettyResult").innerText : lastResponse;
  navigator.clipboard.writeText(text).catch(() => {});
});
applyResultMode();
refreshCatalog(false);
