document.addEventListener("DOMContentLoaded", () => {
  fetch("graph-data.json")
    .then((r) => r.json())
    .then((graphData) => initGraph(graphData))
    .catch((err) => {
      console.error("Error loading graph-data.json", err);
    });
});

function wrapLabel(text, maxChars = 50) {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let current = "";

  for (const w of words) {
    const test = current ? current + " " + w : w;
    if (test.length > maxChars && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(text) {
  let escaped = escapeHtml(text);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/__(.+?)__/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\*(.+?)\*/g, "<em>$1</em>");
  escaped = escaped.replace(/_(.+?)_/g, "<em>$1</em>");
  escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
  return escaped;
}

function markdownToHtml(markdown) {
  if (!markdown) return "";

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  const closeBlockquote = () => {
    if (inBlockquote) {
      html.push("</blockquote>");
      inBlockquote = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      closeBlockquote();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      const tag = `h${level}`;
      html.push(`<${tag}>${formatInlineMarkdown(headingMatch[2])}</${tag}>`);
      continue;
    }

    if (line.startsWith(">")) {
      closeLists();
      const content = formatInlineMarkdown(line.replace(/^>\s?/, ""));
      if (!inBlockquote) {
        html.push("<blockquote>");
        inBlockquote = true;
      }
      html.push(`<p>${content}</p>`);
      continue;
    }

    const unorderedMatch = line.match(/^[*-]\s+(.*)$/);
    if (unorderedMatch) {
      closeBlockquote();
      if (!inUl) {
        closeLists();
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${formatInlineMarkdown(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      closeBlockquote();
      if (!inOl) {
        closeLists();
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
      continue;
    }

    closeLists();
    closeBlockquote();
    html.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  closeLists();
  closeBlockquote();

  return html.join("");
}

function initGraph(graphData) {
  const svg = document.getElementById("graph");
  const detailTitle = document.getElementById("detail-title");
  const detailContent = document.getElementById("detail-content");
  const svgNS = "http://www.w3.org/2000/svg";

  const rootGroup = document.createElementNS(svgNS, "g");
  rootGroup.setAttribute("id", "graph-root");
  svg.appendChild(rootGroup);

  const linkLayer = document.createElementNS(svgNS, "g");
  linkLayer.setAttribute("class", "link-layer");
  const nodeLayer = document.createElementNS(svgNS, "g");
  nodeLayer.setAttribute("class", "node-layer");

  rootGroup.appendChild(linkLayer);
  rootGroup.appendChild(nodeLayer);

  const nodeById = {};
  graphData.nodes.forEach((n) => (nodeById[n.id] = n));

  const adjacency = {};
  const ensureEntry = (id) => {
    if (!adjacency[id]) {
      adjacency[id] = new Set();
    }
    return adjacency[id];
  };

  graphData.links.forEach((link) => {
    const { source, target } = link;
    if (!nodeById[source] || !nodeById[target]) return;
    ensureEntry(source).add(target);
    ensureEntry(target).add(source);
  });

  const visibleNodes = new Set(graphData.nodes.map((node) => node.id));
  let activeNodeId = null;

  function getNodePadding(node) {
    if (node.padding != null) {
      return node.padding;
    }

    switch (node.kind) {
      case "root":
        return 22;
      case "icon":
        return 20;
      case "doc":
        return 18;
      case "label":
        return 8;
      default:
        return 12;
    }
  }

  function showNodeDetail(nodeId) {
    const node = nodeById[nodeId];
    if (!node) return;
    activeNodeId = nodeId;

    const title = node.title || node.label || node.id;
    detailTitle.textContent = title;

    if (node.contentType === "html") {
      detailContent.innerHTML = node.content || "";
    } else {
      detailContent.innerHTML = markdownToHtml(node.content || "");
    }
  }

  function createNodeElement(node) {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${node.x},${node.y})`);
    g.classList.add("graph-node");

    let halfHeight = 0;

    if (node.kind === "root") {
      const r = node.size || 16;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.classList.add("node-root-circle");
      g.classList.add("node-root");
      g.appendChild(circle);
    } else if (node.kind === "icon") {
      const size = node.size || 30;
      halfHeight = size / 2;
      const fillColor = node.color || "#ddd";

      switch (node.shape) {
        case "plus": {
          const square = document.createElementNS(svgNS, "rect");
          square.setAttribute("x", -size / 2);
          square.setAttribute("y", -size / 2);
          square.setAttribute("width", size);
          square.setAttribute("height", size);
          square.setAttribute("rx", 6);
          square.setAttribute("ry", 6);
          square.setAttribute("fill", fillColor);
          square.classList.add("icon-solid");
          g.appendChild(square);

          const plusThickness = size * 0.18;

          const vLine = document.createElementNS(svgNS, "rect");
          vLine.setAttribute("x", -plusThickness / 2);
          vLine.setAttribute("y", -size / 2 + size * 0.18);
          vLine.setAttribute("width", plusThickness);
          vLine.setAttribute("height", size - size * 0.36);
          vLine.setAttribute("fill", "#1f1b16");
          g.appendChild(vLine);

          const hLine = document.createElementNS(svgNS, "rect");
          hLine.setAttribute("x", -size / 2 + size * 0.18);
          hLine.setAttribute("y", -plusThickness / 2);
          hLine.setAttribute("width", size - size * 0.36);
          hLine.setAttribute("height", plusThickness);
          hLine.setAttribute("fill", "#1f1b16");
          g.appendChild(hLine);
          break;
        }
        case "diamond": {
          const polygon = document.createElementNS(svgNS, "polygon");
          polygon.setAttribute(
            "points",
            `0,${-size / 2} ${size / 2},0 0,${size / 2} ${-size / 2},0`
          );
          polygon.setAttribute("fill", fillColor);
          polygon.classList.add("icon-solid");
          g.appendChild(polygon);
          break;
        }
        case "hex": {
          const r = size / 2;
          const points = [];
          for (let i = 0; i < 6; i += 1) {
            const angle = (Math.PI / 3) * i + Math.PI / 6;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            points.push(`${x},${y}`);
          }
          const polygon = document.createElementNS(svgNS, "polygon");
          polygon.setAttribute("points", points.join(" "));
          polygon.setAttribute("fill", fillColor);
          polygon.classList.add("icon-solid");
          g.appendChild(polygon);
          break;
        }
        case "circle": {
          const circle = document.createElementNS(svgNS, "circle");
          circle.setAttribute("r", size / 2);
          circle.setAttribute("fill", fillColor);
          circle.classList.add("icon-solid");
          g.appendChild(circle);
          break;
        }
        case "triangle": {
          const polygon = document.createElementNS(svgNS, "polygon");
          let points;
          if (node.orientation === "down") {
            points = `0,${size / 2} ${-size / 2},${-size / 2} ${size / 2},${-size / 2}`;
          } else {
            points = `0,${-size / 2} ${-size / 2},${size / 2} ${size / 2},${size / 2}`;
          }
          polygon.setAttribute("points", points);
          polygon.setAttribute("fill", fillColor);
          polygon.classList.add("icon-solid");
          g.appendChild(polygon);
          break;
        }
        default: {
          const polygon = document.createElementNS(svgNS, "rect");
          polygon.setAttribute("x", -size / 2);
          polygon.setAttribute("y", -size / 2);
          polygon.setAttribute("width", size);
          polygon.setAttribute("height", size);
          polygon.setAttribute("fill", fillColor);
          polygon.classList.add("icon-solid");
          g.appendChild(polygon);
        }
      }
    } else if (node.kind === "doc") {
      const w = node.width || 20;
      const h = node.height || 26;
      halfHeight = h / 2;

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", -w / 2);
      rect.setAttribute("y", -h / 2);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 3);
      rect.setAttribute("ry", 3);
      if (node.color) {
        rect.setAttribute("fill", node.color);
      }
      rect.setAttribute("class", "doc-rect");
      g.appendChild(rect);

      const fold = document.createElementNS(svgNS, "polyline");
      fold.setAttribute(
        "points",
        `${-w / 2 + 6},${-h / 2 + 2} ${w / 2 - 6},${-h / 2 + 2} ${w / 2 - 6},${-h / 2 + 8}`
      );
      fold.setAttribute("class", "doc-fold");
      g.appendChild(fold);

      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", -w / 2 + 4);
      line1.setAttribute("y1", -2);
      line1.setAttribute("x2", w / 2 - 4);
      line1.setAttribute("y2", -2);
      line1.setAttribute("class", "doc-line");
      g.appendChild(line1);

      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", -w / 2 + 4);
      line2.setAttribute("y1", 2);
      line2.setAttribute("x2", w / 2 - 4);
      line2.setAttribute("y2", 2);
      line2.setAttribute("class", "doc-line");
      g.appendChild(line2);

      const line3 = document.createElementNS(svgNS, "line");
      line3.setAttribute("x1", -w / 2 + 4);
      line3.setAttribute("y1", 6);
      line3.setAttribute("x2", w / 2 - 4);
      line3.setAttribute("y2", 6);
      line3.setAttribute("class", "doc-line");
      g.appendChild(line3);
    } else if (node.kind === "label") {
      halfHeight = 0;
    }

    if (node.label && node.label.trim().length > 0) {
      const wrapWidth = node.labelMaxChars || 50;
      const lines = wrapLabel(node.label, wrapWidth);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("class", "node-label");
      const textAnchor = node.labelAnchor || "start";
      text.setAttribute("text-anchor", textAnchor);

      const baseline = node.labelBaseline || "hanging";
      text.setAttribute("dominant-baseline", baseline);

      const offsetX = node.labelOffsetX != null ? node.labelOffsetX : 0;
      const lineHeight = node.labelLineHeight || 20;
      let baseY;

      if (node.labelOffsetY != null) {
        baseY = node.labelOffsetY;
      } else if (baseline === "middle") {
        baseY = 0;
      } else {
        baseY = halfHeight + 20;
      }

      const startY =
        baseline === "middle"
          ? baseY - ((lines.length - 1) * lineHeight) / 2
          : baseY;

      lines.forEach((line, i) => {
        const tspan = document.createElementNS(svgNS, "tspan");
        tspan.setAttribute("x", offsetX);
        tspan.setAttribute("y", startY + i * lineHeight);
        tspan.textContent = line;
        text.appendChild(tspan);
      });

      if (node.labelFontSize) {
        text.style.fontSize = `${node.labelFontSize}px`;
      }

      if (node.labelFontWeight) {
        text.style.fontWeight = node.labelFontWeight;
      }

      if (node.labelLetterSpacing) {
        text.style.letterSpacing = node.labelLetterSpacing;
      }

      if (node.labelColor) {
        text.setAttribute("fill", node.labelColor);
      }

      if (node.labelClass) {
        text.classList.add(node.labelClass);
      } else if (node.kind === "label") {
        text.classList.add("node-label-secondary");
      } else if (node.kind === "doc") {
        text.classList.add("node-label-tertiary");
      }

      g.appendChild(text);
    }

    g.addEventListener("click", (event) => {
      event.stopPropagation();
      revealNeighbors(node.id);
      showNodeDetail(node.id);
    });

    return g;
  }

  function createLinkElement(sourceNode, targetNode) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("class", "link");

    const dx = targetNode.x - sourceNode.x;
    const dy = targetNode.y - sourceNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const startPadding = getNodePadding(sourceNode);
    const endPadding = getNodePadding(targetNode);

    const startX = sourceNode.x + (dx / distance) * startPadding;
    const startY = sourceNode.y + (dy / distance) * startPadding;
    const endX = targetNode.x - (dx / distance) * endPadding;
    const endY = targetNode.y - (dy / distance) * endPadding;

    // Create squared/angled path: go horizontal first, then vertical
    const midX = startX + (endX - startX) * 0.5;
    path.setAttribute("d", `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`);

    return path;
  }

  function renderGraph() {
    while (linkLayer.firstChild) {
      linkLayer.removeChild(linkLayer.firstChild);
    }
    while (nodeLayer.firstChild) {
      nodeLayer.removeChild(nodeLayer.firstChild);
    }

    graphData.links.forEach((link) => {
      const { source, target } = link;
      if (!visibleNodes.has(source) || !visibleNodes.has(target)) return;

      const sourceNode = nodeById[source];
      const targetNode = nodeById[target];
      if (!sourceNode || !targetNode) return;

      linkLayer.appendChild(createLinkElement(sourceNode, targetNode));
    });

    graphData.nodes.forEach((node) => {
      if (!visibleNodes.has(node.id)) return;
      nodeLayer.appendChild(createNodeElement(node));
    });

    if (!activeNodeId || !visibleNodes.has(activeNodeId)) {
      showNodeDetail("root");
    }
  }

  function revealNeighbors(nodeId) {
    const neighbors = adjacency[nodeId];
    if (!neighbors) return;
    neighbors.forEach((neighborId) => visibleNodes.add(neighborId));
    renderGraph();
  }

  renderGraph();
  showNodeDetail("root");

  const container = document.getElementById("graph-container");
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  const xValues = graphData.nodes.map((n) => n.x);
  const yValues = graphData.nodes.map((n) => n.y);
  const minX = Math.min(...xValues);
  const minY = Math.min(...yValues);
  const initialPadding = 40;

  currentX = initialPadding - minX;
  currentY = initialPadding - minY;
  rootGroup.setAttribute("transform", `translate(${currentX},${currentY})`);

  function pointerDown(e) {
    if (e.button !== 0) return;
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    container.setPointerCapture(e.pointerId);
    container.classList.add("dragging");
  }

  function pointerMove(e) {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    rootGroup.setAttribute(
      "transform",
      `translate(${currentX + dx},${currentY + dy})`
    );
  }

  function pointerUp(e) {
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    currentX += dx;
    currentY += dy;
    isPanning = false;
    container.classList.remove("dragging");
    try {
      container.releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }
  }

  container.addEventListener("pointerdown", pointerDown);
  container.addEventListener("pointermove", pointerMove);
  container.addEventListener("pointerup", pointerUp);
  container.addEventListener("pointercancel", pointerUp);
}
