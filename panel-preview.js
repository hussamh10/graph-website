(function () {
  "use strict";

  function createStatusManager(element) {
    return function setStatus(message, state = "info") {
      if (!element) return;
      element.textContent = message;
      if (state === "info") {
        element.removeAttribute("data-state");
      } else {
        element.setAttribute("data-state", state);
      }
    };
  }

  function getPanelLabel(node) {
    return node.title || node.label || node.panelId || node.id;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const panelModule = window.PanelManager;
    if (!panelModule || typeof panelModule.createPanelManager !== "function") {
      console.error("PanelManager module is not available on the preview page.");
      return;
    }

    const detailPanel = document.getElementById("detail-panel");
    const detailTitle = document.getElementById("detail-title");
    const detailContent = document.getElementById("detail-content");
    const panelSelect = document.getElementById("panel-select");
    const reloadButton = document.getElementById("reload-panel");
    const clearButton = document.getElementById("clear-panel");
    const statusElement = document.getElementById("panel-status");
    const metaIdElement = document.getElementById("panel-meta-id");
    const metaTitleElement = document.getElementById("panel-meta-title");

    if (!detailPanel || !detailContent || !panelSelect) {
      console.error("Preview markup is missing required elements.");
      return;
    }

    const setStatus = createStatusManager(statusElement);
    const panelManager = panelModule.createPanelManager(detailContent);

    let panelMap = new Map();
    let activePanelId = "";

    function updateMeta(node) {
      if (node) {
        const id = node.panelId || node.id;
        metaIdElement.textContent = id || "—";
        metaTitleElement.textContent = getPanelLabel(node) || "—";
      } else {
        metaIdElement.textContent = "—";
        metaTitleElement.textContent = "—";
      }
    }

    function showPlaceholder() {
      activePanelId = "";
      panelManager.clearPanel();
      detailPanel.classList.remove("detail-panel--panel", "detail-panel--html", "detail-panel--markdown");
      detailPanel.classList.add("detail-panel--plain");
      detailTitle.textContent = "Panel preview";
      detailContent.innerHTML =
        '<p class="preview-placeholder">Select a panel from the list to load it inside this fixed-size preview.</p>';
      reloadButton.disabled = true;
      updateMeta(null);
      setStatus("Choose a panel to start the preview.");
    }

    function applyPanelLayout(node) {
      detailPanel.classList.add("detail-panel--plain", "detail-panel--panel");
      detailPanel.classList.remove("detail-panel--html", "detail-panel--markdown");
      detailTitle.textContent = "";
      updateMeta(node);
    }

    function loadPanel(panelId) {
      const node = panelMap.get(panelId);
      if (!node) {
        setStatus(`Panel "${panelId}" is not defined in graph-data.json.`, "error");
        return;
      }

      activePanelId = panelId;
      applyPanelLayout(node);
      panelManager.loadPanel(panelId, node);
      reloadButton.disabled = false;
      setStatus(`Loaded panel "${panelId}".`, "success");
    }

    panelSelect.addEventListener("change", () => {
      const panelId = panelSelect.value;
      if (!panelId) {
        showPlaceholder();
        return;
      }
      loadPanel(panelId);
    });

    reloadButton.addEventListener("click", () => {
      if (!activePanelId) return;
      setStatus(`Reloading panel "${activePanelId}"…`);
      loadPanel(activePanelId);
    });

    clearButton.addEventListener("click", () => {
      panelSelect.value = "";
      showPlaceholder();
    });

    showPlaceholder();

    fetch("graph-data.json")
      .then((response) => response.json())
      .then((graphData) => {
        const panels = (graphData.nodes || []).filter((node) => node.contentType === "panel");
        panels.sort((a, b) => getPanelLabel(a).localeCompare(getPanelLabel(b)));
        panelMap = new Map(panels.map((node) => [node.panelId || node.id, node]));

        panels.forEach((node) => {
          const id = node.panelId || node.id;
          const option = document.createElement("option");
          option.value = id;
          option.textContent = getPanelLabel(node);
          panelSelect.appendChild(option);
        });

        if (panels.length === 0) {
          setStatus("No panels are defined in graph-data.json yet.", "error");
          reloadButton.disabled = true;
        } else {
          setStatus("Panel list loaded. Select a panel to preview.");
        }
      })
      .catch((error) => {
        console.error("Unable to load graph-data.json for preview", error);
        setStatus("Could not load panel list. Check the console for details.", "error");
      });
  });
})();
