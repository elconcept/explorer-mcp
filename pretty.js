"use strict";
/*
 * A deliberately small, safe MCP response renderer. It never parses server text
 * as HTML, uses no innerHTML, and only permits http(s) links.
 * RAW JSON is retained by the caller as the lossless representation.
 */
window.MCPPretty = (() => {
  const MAX_TEXT = 600000;
  const MAX_LINES = 10000;
  const MAX_DEPTH = 8;
  const element = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };

  function appendInline(parent, source, depth = 0) {
    const text = String(source);
    if (depth > 5 || text.length > 25000) {
      parent.append(document.createTextNode(text));
      return;
    }
    const pattern = /(\[([^\]\n]{1,400})\]\((https?:\/\/[^\s)]+)\)|\x60([^\x60\n]+)\x60|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
    let match;
    let cursor = 0;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) {
        parent.append(document.createTextNode(text.slice(cursor, match.index)));
      }
      let node;
      if (match[2] !== undefined) {
        node = element("a");
        try {
          const url = new URL(match[3]);
          if (url.protocol === "https:" || url.protocol === "http:") {
            node.href = url.href;
            node.target = "_blank";
            node.rel = "noopener noreferrer";
            appendInline(node, match[2], depth + 1);
          } else {
            node.append(document.createTextNode(match[0]));
          }
        } catch {
          node.append(document.createTextNode(match[0]));
        }
      } else if (match[4] !== undefined) {
        node = element("code", "", match[4]);
      } else {
        const variants = [
          [5, "strong"], [6, "strong"], [7, "del"], [8, "em"], [9, "em"],
        ];
        const variant = variants.find((pair) => match[pair[0]] !== undefined);
        node = element(variant[1]);
        appendInline(node, match[variant[0]], depth + 1);
      }
      parent.append(node);
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }

  function inlineLines(parent, source) {
    const lines = String(source).split("\n");
    lines.forEach((line, index) => {
      if (index) parent.append(element("br"));
      appendInline(parent, line);
    });
  }

  const listPattern = /^(\s{0,12})([-+*]|\d+[.)])\s+(.+)$/;
  const headingPattern = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
  const codePattern = /^\s{0,3}(\x60{3,}|~{3,})\s*(.*)$/;
  const quotePattern = /^\s{0,3}>\s?(.*)$/;
  const separatorPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
  const horizontalPattern = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

  function splitCells(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map(
      (cell) => cell.trim().replace(/\\\|/g, "|")
    );
  }

  function startsBlock(line) {
    return headingPattern.test(line) || codePattern.test(line) ||
      quotePattern.test(line) || horizontalPattern.test(line) ||
      listPattern.test(line);
  }

  function renderMarkdown(value, root, depth = 0) {
    const text = String(value).replace(/\r\n?/g, "\n");
    if (text.length > MAX_TEXT || depth > MAX_DEPTH) {
      root.append(element("pre", "pretty-code", text.slice(0, MAX_TEXT)));
      if (text.length > MAX_TEXT) {
        root.append(element("p", "pretty-note", "Długi wynik — pełna zawartość w RAW JSON."));
      }
      return;
    }
    const lines = text.split("\n");
    if (lines.length > MAX_LINES) {
      root.append(element("pre", "pretty-code", text.slice(0, MAX_TEXT)));
      root.append(element("p", "pretty-note", "Zbyt wiele wierszy — pełna zawartość w RAW JSON."));
      return;
    }
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = line.match(codePattern);
      if (fence) {
        const char = fence[1][0], min = fence[1].length;
        const language = fence[2].trim();
        const body = [];
        i++;
        while (i < lines.length) {
          const close = lines[i].match(codePattern);
          if (close && close[1][0] === char && close[1].length >= min) { i++; break; }
          body.push(lines[i++]);
        }
        const pre = element("pre", "pretty-code");
        const code = element("code", "", body.join("\n"));
        if (language) code.dataset.language = language.slice(0, 60);
        pre.append(code);
        root.append(pre);
        continue;
      }
      const heading = line.match(headingPattern);
      if (heading) {
        const h = element("h" + heading[1].length);
        appendInline(h, heading[2]);
        root.append(h);
        i++; continue;
      }
      if (horizontalPattern.test(line)) {
        root.append(element("hr"));
        i++; continue;
      }
      const quote = line.match(quotePattern);
      if (quote) {
        const block = element("blockquote");
        const content = [];
        while (i < lines.length && quotePattern.test(lines[i])) {
          content.push(lines[i++].replace(quotePattern, "$1"));
        }
        renderMarkdown(content.join("\n"), block, depth + 1);
        root.append(block);
        continue;
      }
      if (i + 1 < lines.length && line.includes("|") && separatorPattern.test(lines[i+1])) {
        const table = element("table");
        const thead = element("thead"), tbody = element("tbody"), tr = element("tr");
        const headers = splitCells(line);
        headers.forEach((cell) => { const th = element("th"); appendInline(th, cell); tr.append(th); });
        thead.append(tr);
        table.append(thead);
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          const row = element("tr");
          const cells = splitCells(lines[i++]);
          headers.forEach((_, index) => {
            const td = element("td");
            appendInline(td, cells[index] ?? "");
            row.append(td);
          });
          tbody.append(row);
        }
        table.append(tbody);
        root.append(table);
        continue;
      }
      const firstItem = line.match(listPattern);
      if (firstItem) {
        const ordered = /^\d/.test(firstItem[2]);
        const baseIndent = firstItem[1].length;
        const list = element(ordered ? "ol" : "ul");
        if (ordered) list.start = Number(firstItem[2].match(/^\d+/)[0]);
        const stack = [{indent: baseIndent, list, last: null, ordered}];
        while (i < lines.length) {
          const match = lines[i].match(listPattern);
          if (!match || match[1].length < baseIndent) break;
          const indent = match[1].length;
          const isOrdered = /^\d/.test(match[2]);
          while (stack.length > 1 && indent < stack[stack.length-1].indent) stack.pop();
          let current = stack[stack.length-1];
          if (indent > current.indent && current.last && stack.length < 6) {
            const nested = element(isOrdered ? "ol" : "ul");
            current.last.append(nested);
            current = {indent, list:nested, last:null, ordered:isOrdered};
            stack.push(current);
          } else if (indent === current.indent && isOrdered !== current.ordered) {
            break;
          }
          const li = element("li");
          const check = match[3].match(/^\[([ xX])\]\s+(.*)$/);
          if (check) {
            const box = element("input");
            box.type = "checkbox"; box.disabled = true;
            box.checked = check[1].toLowerCase() === "x";
            li.append(box);
            appendInline(li, check[2]);
          } else {
            appendInline(li, match[3]);
          }
          current.list.append(li);
          current.last = li;
          i++;
        }
        root.append(list);
        continue;
      }
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && (paragraph.length === 0 || !startsBlock(lines[i]))) {
        if (paragraph.length && lines[i].includes("|") && i+1 < lines.length &&
            separatorPattern.test(lines[i+1])) break;
        paragraph.push(lines[i++].trim());
      }
      if (!paragraph.length) { i++; continue; }
      const p = element("p");
      inlineLines(p, paragraph.join("\n"));
      root.append(p);
    }
  }

  function parseJsonText(value) {
    const text = String(value).trim();
    if (!/^[\[{]/.test(text) || text.length > MAX_TEXT) return undefined;
    try { return JSON.parse(text); } catch { return undefined; }
  }

  function renderValue(value, root, depth = 0) {
    if (depth > MAX_DEPTH) {
      root.append(element("pre", "pretty-code", JSON.stringify(value, null, 2)?.slice(0, MAX_TEXT) || ""));
      return;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      root.append(element("span", "pretty-primitive", String(value)));
      return;
    }
    if (typeof value === "string") {
      renderMarkdown(value, root, depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      if (!value.length) { root.append(element("span", "pretty-note", "Pusta lista")); return; }
      const list = element("ol", "pretty-data-list");
      value.slice(0, 500).forEach((item) => {
        const li = element("li");
        renderValue(item, li, depth + 1);
        list.append(li);
      });
      root.append(list);
      if (value.length > 500) root.append(element("p", "pretty-note", "Pozostałe elementy w RAW JSON."));
      return;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length) { root.append(element("span", "pretty-note", "Pusty obiekt")); return; }
      const grid = element("div", "pretty-object");
      entries.slice(0, 500).forEach(([key, entry]) => {
        const row = element("div", "pretty-field");
        const label = element("div", "pretty-key", key);
        const cell = element("div", "pretty-value");
        renderValue(entry, cell, depth + 1);
        row.append(label, cell);
        grid.append(row);
      });
      root.append(grid);
      if (entries.length > 500) root.append(element("p", "pretty-note", "Pozostałe pola w RAW JSON."));
    }
  }

  function renderText(value, parent) {
    const parsed = parseJsonText(value);
    if (parsed !== undefined && parsed !== null && typeof parsed === "object") {
      renderValue(parsed, parent);
    } else {
      renderMarkdown(value, parent);
    }
  }

  function renderResult(result, root) {
    root.replaceChildren();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      renderValue(result, root);
      return;
    }
    if (result.isError === true) root.append(element("p", "pretty-error", "Błąd zgłoszony przez narzędzie MCP"));
    let rendered = false;
    if (Array.isArray(result.content)) {
      result.content.forEach((block, index) => {
        if (index >= 100) return;
        if (index > 0) root.append(element("hr", "pretty-separator"));
        const container = element("section", "pretty-block");
        if (block?.type === "text" && typeof block.text === "string") {
          renderText(block.text, container);
        } else if (block?.type === "resource" && block.resource?.text !== undefined) {
          if (block.resource.uri) container.append(element("p", "pretty-note", block.resource.uri));
          renderText(String(block.resource.text), container);
        } else {
          renderValue(block, container);
        }
        root.append(container);
        rendered = true;
      });
      if (result.content.length > 100) root.append(
        element("p", "pretty-note", "Więcej bloków odpowiedzi znajduje się w RAW JSON.")
      );
    }
    if (result.structuredContent !== undefined) {
      if (rendered) {
        const details = element("details", "pretty-extra");
        details.append(element("summary", "", "Dane strukturalne"));
        const wrapper = element("div");
        renderValue(result.structuredContent, wrapper);
        details.append(wrapper);
        root.append(details);
      } else {
        renderValue(result.structuredContent, root);
        rendered = true;
      }
    }
    if (!rendered) renderValue(result, root);
  }

  return Object.freeze({render: renderResult});
})();
