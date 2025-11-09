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

  const visibleNodes = new Set(["root"]);
  let activeNodeId = null;
  let highlightedNodes = new Set(["root"]);
  let highlightedLinks = new Set();

  const parentById = {};
  const depthById = {};
  const childrenById = {};

  function ensureChildrenSet(id) {
    if (!childrenById[id]) {
      childrenById[id] = new Set();
    }
    return childrenById[id];
  }

  function edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function buildHierarchy() {
    const rootId = "root";
    if (!nodeById[rootId]) return;

    const queue = [rootId];
    parentById[rootId] = null;
    depthById[rootId] = 0;
    ensureChildrenSet(rootId);

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = adjacency[current];
      if (!neighbors) continue;

      neighbors.forEach((neighborId) => {
        if (parentById.hasOwnProperty(neighborId)) return;
        parentById[neighborId] = current;
        depthById[neighborId] = depthById[current] + 1;
        ensureChildrenSet(current).add(neighborId);
        ensureChildrenSet(neighborId);
        queue.push(neighborId);
      });
    }
  }

  buildHierarchy();

  function updateHighlights(targetId) {
    const newHighlightedNodes = new Set();
    const newHighlightedLinks = new Set();

    if (!nodeById[targetId]) {
      highlightedNodes = newHighlightedNodes;
      highlightedLinks = newHighlightedLinks;
      return;
    }

    let currentId = targetId;
    while (currentId) {
      newHighlightedNodes.add(currentId);
      const parentId = parentById[currentId];
      if (parentId) {
        newHighlightedNodes.add(parentId);
        newHighlightedLinks.add(edgeKey(currentId, parentId));
      }
      currentId = parentId;
    }

    const children = childrenById[targetId];
    if (children) {
      children.forEach((childId) => {
        newHighlightedNodes.add(childId);
        newHighlightedLinks.add(edgeKey(targetId, childId));
      });
    }

    highlightedNodes = newHighlightedNodes;
    highlightedLinks = newHighlightedLinks;
  }

  function getNodePadding(node) {
    switch (node.kind) {
      case "root":
        return 18;
      case "icon":
        return 16;
      case "doc":
        return 18;
      case "label":
        return 14;
      default:
        return 12;
    }
  }

  function showNodeDetail(nodeId) {
    const node = nodeById[nodeId];
    if (!node) return;
    updateHighlights(nodeId);
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
    
    // Random rotation for shapes (between -8 and 8 degrees)
    const randomRotation = (Math.random() - 0.5) * 16;
    const shapeGroup = document.createElementNS(svgNS, "g");
    shapeGroup.setAttribute("transform", `rotate(${randomRotation})`);

    if (node.kind === "root") {
      const r = 14;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.classList.add("node-root-circle");
      g.classList.add("node-root");
      shapeGroup.appendChild(circle);
    } else if (node.kind === "icon") {
      const size = 22;
      halfHeight = size / 2;
      const poly = document.createElementNS(svgNS, "polygon");
      let points;

      if (node.orientation === "down") {
        points = `0,${size / 2} ${-size / 2},${-size / 2} ${size / 2},${-size / 2}`;
      } else {
        points = `0,${-size / 2} ${-size / 2},${size / 2} ${size / 2},${size / 2}`;
      }

      poly.setAttribute("points", points);
      poly.setAttribute("class", "icon-shape");
      poly.setAttribute("fill", node.color || "#ddd");
      shapeGroup.appendChild(poly);
    } else if (node.kind === "doc") {
      const w = 16;
      const h = 20;
      halfHeight = h / 2;

      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", -w / 2);
      rect.setAttribute("y", -h / 2);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 2);
      rect.setAttribute("ry", 2);
      rect.setAttribute("class", "doc-rect");
      shapeGroup.appendChild(rect);

      const fold = document.createElementNS(svgNS, "polyline");
      fold.setAttribute(
        "points",
        `${0},${-h / 2} ${w / 2 - 3},${-h / 2} ${w / 2 - 3},${-h / 2 + 5}`
      );
      fold.setAttribute("class", "doc-fold");
      shapeGroup.appendChild(fold);

      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", -w / 2 + 2);
      line1.setAttribute("y1", -2);
      line1.setAttribute("x2", w / 2 - 2);
      line1.setAttribute("y2", -2);
      line1.setAttribute("class", "doc-line");
      shapeGroup.appendChild(line1);

      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", -w / 2 + 2);
      line2.setAttribute("y1", 1);
      line2.setAttribute("x2", w / 2 - 2);
      line2.setAttribute("y2", 1);
      line2.setAttribute("class", "doc-line");
      shapeGroup.appendChild(line2);

      const line3 = document.createElementNS(svgNS, "line");
      line3.setAttribute("x1", -w / 2 + 2);
      line3.setAttribute("y1", 4);
      line3.setAttribute("x2", w / 2 - 2);
      line3.setAttribute("y2", 4);
      line3.setAttribute("class", "doc-line");
      shapeGroup.appendChild(line3);
    } else if (node.kind === "label") {
      const r = 10;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.setAttribute("class", "node-label-shape");
      shapeGroup.appendChild(circle);
    }
    
    g.appendChild(shapeGroup);
    g.style.opacity =
      highlightedNodes.size === 0 || highlightedNodes.has(node.id) ? "1" : "0.15";

    if (node.label && node.label.trim().length > 0) {
      const lines = wrapLabel(node.label, 50);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("class", "node-label");
      text.setAttribute("text-anchor", "middle");

      const baseY = halfHeight + 18;
      const lineHeight = 16;

      lines.forEach((line, i) => {
        const tspan = document.createElementNS(svgNS, "tspan");
        tspan.setAttribute("x", 0);
        tspan.setAttribute("y", baseY + i * lineHeight);
        tspan.textContent = line;
        text.appendChild(tspan);
      });

      g.appendChild(text);
    }

    g.addEventListener("click", (event) => {
      event.stopPropagation();
      showNodeDetail(node.id);
      revealNeighbors(node.id);
      centerNode(node.id);
    });

    return g;
  }

  function createLinkElement(sourceNode, targetNode) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("class", "link");
    const key = edgeKey(sourceNode.id, targetNode.id);
    path.style.opacity =
      highlightedLinks.size === 0 || highlightedLinks.has(key) ? "1" : "0.15";

    const dx = targetNode.x - sourceNode.x;
    const dy = targetNode.y - sourceNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const startPadding = getNodePadding(sourceNode);
    const endPadding = getNodePadding(targetNode);

    const startX = sourceNode.x + (dx / distance) * startPadding;
    const startY = sourceNode.y + (dy / distance) * startPadding;
    const endX = targetNode.x - (dx / distance) * endPadding;
    const endY = targetNode.y - (dy / distance) * endPadding;

    // Create jittery path with random perturbations
    const segments = 8; // Number of segments for jitter
    const jitterAmount = 5; // Max pixels to jitter
    const points = [`M ${startX} ${startY}`];
    
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const x = startX + (endX - startX) * t + (Math.random() - 0.5) * jitterAmount;
      const y = startY + (endY - startY) * t + (Math.random() - 0.5) * jitterAmount;
      points.push(`L ${x} ${y}`);
    }
    
    points.push(`L ${endX} ${endY}`);
    path.setAttribute("d", points.join(" "));

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

  showNodeDetail("root");
  renderGraph();

  const container = document.getElementById("graph-container");
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  // Center the root node initially
  const rootNode = nodeById["root"];
  if (rootNode) {
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    currentX = centerX - rootNode.x;
    currentY = centerY - rootNode.y;
  } else {
    // Fallback if no root node
    const xValues = graphData.nodes.map((n) => n.x);
    const yValues = graphData.nodes.map((n) => n.y);
    const minX = Math.min(...xValues);
    const minY = Math.min(...yValues);
    const initialPadding = 40;
    
    currentX = initialPadding - minX;
    currentY = initialPadding - minY;
  }
  rootGroup.setAttribute("transform", `translate(${currentX},${currentY})`);

  function centerNode(nodeId, duration = 600) {
    const node = nodeById[nodeId];
    if (!node) return;
    
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    // Calculate target position to center the node
    const targetX = centerX - node.x;
    const targetY = centerY - node.y;
    
    // Animate from current position to target
    const startX = currentX;
    const startY = currentY;
    const startTime = performance.now();
    
    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      currentX = startX + (targetX - startX) * easeProgress;
      currentY = startY + (targetY - startY) * easeProgress;
      
      rootGroup.setAttribute("transform", `translate(${currentX},${currentY})`);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }
    
    requestAnimationFrame(animate);
  }

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
