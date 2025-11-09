(function (global) {
  "use strict";

  async function fetchOptionalText(url) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) {
        if (response.status !== 404) {
          console.warn(`Panel asset request failed for ${url}: ${response.status}`);
        }
        return null;
      }
      return await response.text();
    } catch (error) {
      console.warn(`Panel asset request threw for ${url}`, error);
      return null;
    }
  }

  function isValidPanelId(panelId) {
    return typeof panelId === "string" && /^[a-zA-Z0-9_-]+$/.test(panelId);
  }

  function createPanelManager(detailContent) {
    if (!detailContent) {
      throw new Error("createPanelManager requires a detail content element");
    }

    const head = document.head;
    let currentStyles = [];
    let cleanupFn = null;
    let loadToken = 0;
    let activePanelId = null;

    function runCleanup() {
      if (cleanupFn) {
        try {
          cleanupFn();
        } catch (error) {
          console.error(`Error cleaning up panel ${activePanelId}`, error);
        }
      }
      cleanupFn = null;
      activePanelId = null;
    }

    function removeStyles() {
      currentStyles.forEach((styleEl) => styleEl.remove());
      currentStyles = [];
    }

    function clearDataset() {
      delete detailContent.dataset.panelId;
    }

    function clearPanel({ resetContent = true } = {}) {
      loadToken++;
      runCleanup();
      removeStyles();
      detailContent.classList.remove("panel-active");
      clearDataset();
      if (resetContent) {
        detailContent.innerHTML = "";
      }
    }

    async function loadPanel(panelId, node) {
      if (!isValidPanelId(panelId)) {
        clearPanel();
        detailContent.innerHTML = `<div class="panel-error">Panel "${panelId}" is not available.</div>`;
        return;
      }

      const token = ++loadToken;
      runCleanup();
      removeStyles();

      detailContent.classList.add("panel-active");
      detailContent.dataset.panelId = panelId;
      detailContent.innerHTML = '<div class="panel-loading">Loading panel…</div>';

      const basePath = `panels/${panelId}`;
      const html = await fetchOptionalText(`${basePath}/panel.html`);
      if (token !== loadToken) return;

      if (!html) {
        detailContent.innerHTML = `<div class="panel-error">Panel content for "${panelId}" could not be loaded.</div>`;
        clearDataset();
        detailContent.classList.remove("panel-active");
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "panel-container";
      wrapper.innerHTML = html;
      detailContent.replaceChildren(wrapper);

      const cssText = await fetchOptionalText(`${basePath}/panel.css`);
      if (token !== loadToken) return;
      if (cssText) {
        const styleEl = document.createElement("style");
        styleEl.textContent = cssText;
        styleEl.dataset.panelId = panelId;
        styleEl.classList.add("panel-style");
        head.appendChild(styleEl);
        currentStyles.push(styleEl);
      }

      const jsText = await fetchOptionalText(`${basePath}/panel.js`);
      if (token !== loadToken) return;
      cleanupFn = null;
      if (jsText) {
        try {
          const factory = new Function("container", "context", jsText);
          const context = { panelId, node };
          const result = factory(wrapper, context);
          if (typeof result === "function") {
            cleanupFn = () => {
              try {
                result();
              } catch (error) {
                console.error(`Error running cleanup for panel ${panelId}`, error);
              }
            };
          } else if (result && typeof result === "object" && typeof result.cleanup === "function") {
            cleanupFn = () => {
              try {
                result.cleanup();
              } catch (error) {
                console.error(`Error running cleanup for panel ${panelId}`, error);
              }
            };
          }
        } catch (error) {
          console.error(`Error executing script for panel ${panelId}`, error);
        }
      }

      activePanelId = panelId;
    }

    return Object.freeze({
      loadPanel,
      clearPanel,
    });
  }

  const api = Object.freeze({ createPanelManager });
  global.PanelManager = api;
})(typeof window !== "undefined" ? window : globalThis);
