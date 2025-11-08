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

function initGraph(graphData) {
  const svg = document.getElementById("graph");
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

  function createNodeElement(node) {
    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${node.x},${node.y})`);
    g.classList.add("graph-node");

    let halfHeight = 0; // vertical half-size of shape (for label placement)

    if (node.kind === "root") {
      const r = 14;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.classList.add("node-root-circle");
      g.classList.add("node-root");
      g.appendChild(circle);
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
      g.appendChild(poly);
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
      g.appendChild(rect);

      const fold = document.createElementNS(svgNS, "polyline");
      fold.setAttribute(
        "points",
        `${0},${-h / 2} ${w / 2 - 3},${-h / 2} ${w / 2 - 3},${-h / 2 + 5}`
      );
      fold.setAttribute("class", "doc-fold");
      g.appendChild(fold);

      const line1 = document.createElementNS(svgNS, "line");
      line1.setAttribute("x1", -w / 2 + 2);
      line1.setAttribute("y1", -2);
      line1.setAttribute("x2", w / 2 - 2);
      line1.setAttribute("y2", -2);
      line1.setAttribute("class", "doc-line");
      g.appendChild(line1);

      const line2 = document.createElementNS(svgNS, "line");
      line2.setAttribute("x1", -w / 2 + 2);
      line2.setAttribute("y1", 2);
      line2.setAttribute("x2", w / 2 - 2);
      line2.setAttribute("y2", 2);
      line2.setAttribute("class", "doc-line");
      g.appendChild(line2);
    } else if (node.kind === "label") {
      // previously text-only → now a small circle
      const r = 6;
      halfHeight = r;
      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("r", r);
      circle.setAttribute("class", "node-label-shape");
      g.appendChild(circle);
    }

    if (node.label && node.label.trim().length > 0) {
      const lines = wrapLabel(node.label, 50);
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("class", "node-label");
      text.setAttribute("text-anchor", "middle");

      const baseY = halfHeight + 18; // distance under the shape
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

    g.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });

    g.addEventListener("click", (event) => {
      event.stopPropagation();
      revealNeighbors(node.id);
    });

    return g;
  }

  function createLinkElement(sourceNode, targetNode) {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("class", "link");

    const midX = (sourceNode.x + targetNode.x) / 2;
    const d = `M ${sourceNode.x} ${sourceNode.y} L ${midX} ${sourceNode.y} L ${midX} ${targetNode.y} L ${targetNode.x} ${targetNode.y}`;
    path.setAttribute("d", d);

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
  }

  function revealNeighbors(nodeId) {
    const neighbors = adjacency[nodeId];
    if (!neighbors) return;
    neighbors.forEach((neighborId) => visibleNodes.add(neighborId));
    renderGraph();
  }

  renderGraph();

  // Panning
  const container = document.getElementById("graph-container");
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  function pointerDown(e) {
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
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
  }

  container.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
}
