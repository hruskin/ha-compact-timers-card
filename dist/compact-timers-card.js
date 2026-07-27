/*
 * Compact Timers Card
 * Kompaktni odpocet casovacu Google Home / Nest a nativnich timer.* entit.
 * https://github.com/hruskin/ha-compact-timers-card
 */

const CARD_VERSION = "1.1.0";

console.info(
  `%c COMPACT-TIMERS-CARD %c v${CARD_VERSION} `,
  "color:#fff;background:#3f51b5;font-weight:700",
  "color:#3f51b5;background:#fff;font-weight:700"
);

const DEFAULTS = {
  icon: "mdi:timer-sand",
  hide_when_empty: true,
  show_cancel: true,
  confirm_cancel: true,
  warn_ratio: 0.2,
  danger_seconds: 10,
  linger_seconds: 20,
  max_timers: 0,
};

const LABELS = {
  entities: "Zdroje časovačů",
  title: "Nadpis karty (prázdné = bez hlavičky)",
  icon: "Výchozí ikona řádku",
  hide_when_empty: "Skrýt kartu, když nic neběží",
  show_cancel: "Tlačítko pro zrušení",
  confirm_cancel: "Rušit na dva kliky",
  max_timers: "Max. počet řádků (0 = bez limitu)",
  danger_seconds: "Červená pod (s)",
  warn_ratio: "Žlutá pod (podíl 0–1)",
  linger_seconds: "Doběhlý řádek držet (s)",
};

function isTimerSource(entityId) {
  return (
    (entityId.startsWith("sensor.") && entityId.endsWith("_timers")) ||
    entityId.startsWith("timer.")
  );
}

function parseDuration(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value);
  const match = text.match(/(?:(\d+)\s*day[s]?,\s*)?(\d+):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  const days = Number(match[1] || 0);
  const a = Number(match[2]);
  const b = Number(match[3]);
  const c = match[4] === undefined ? null : Number(match[4]);
  return c === null
    ? days * 86400 + a * 60 + b
    : days * 86400 + a * 3600 + b * 60 + c;
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function normalizeSources(entities, fallbackIcon) {
  return (entities || []).map((item) =>
    typeof item === "string"
      ? { entity: item, icon: fallbackIcon }
      : { entity: item.entity, icon: item.icon || fallbackIcon }
  );
}

class CompactTimersCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._rows = new Map();
    this._armed = new Map();
    this._frozen = new Map();
    this._tick = null;
    this._signature = "";
  }

  static getConfigElement() {
    return document.createElement("compact-timers-card-editor");
  }

  static getStubConfig(hass) {
    const entities = Object.keys(hass.states).filter(
      (id) => id.startsWith("sensor.") && id.endsWith("_timers")
    );
    return { type: "custom:compact-timers-card", entities };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || !config.entities.length) {
      throw new Error("Vyber alespon jeden zdroj casovacu.");
    }
    this._config = Object.assign({}, DEFAULTS, config);
    this._config.sources = normalizeSources(config.entities, this._config.icon);
    this._signature = "";
    this._buildShell();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  connectedCallback() {
    if (!this._tick) this._tick = setInterval(() => this._render(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
  }

  getCardSize() {
    return 1 + Math.ceil(this._rows.size / 2);
  }

  _buildShell() {
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 8px 14px; }
        .head {
          display: flex; align-items: center; gap: 6px;
          font-size: 13px; color: var(--secondary-text-color);
          padding-bottom: 4px;
        }
        .head ha-icon { --mdc-icon-size: 16px; }
        .row {
          display: flex; align-items: center; gap: 8px;
          padding: 3px 0; min-height: 24px;
        }
        .row + .row { border-top: 1px solid var(--divider-color); }
        .ic { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: none; }
        .set {
          font-family: var(--code-font-family, monospace);
          font-size: 12px; color: var(--secondary-text-color);
          width: 52px; text-align: right; flex: none;
        }
        .track {
          flex: 1 1 auto; height: 6px; border-radius: 3px;
          background: var(--divider-color); overflow: hidden; min-width: 40px;
        }
        .fill { height: 100%; border-radius: 3px; transition: width 1s linear; }
        .fill.frozen { transition: none; opacity: .5; }
        .rem {
          font-family: var(--code-font-family, monospace);
          font-size: 14px; font-weight: 500; color: var(--primary-text-color);
          width: 58px; text-align: right; flex: none;
        }
        .cancel {
          flex: none; width: 26px; height: 26px; padding: 0; margin: 0;
          border: none; border-radius: 50%; background: none; cursor: pointer;
          color: var(--secondary-text-color);
          display: flex; align-items: center; justify-content: center;
        }
        .cancel ha-icon { --mdc-icon-size: 16px; }
        .cancel:hover { background: var(--divider-color); }
        .cancel.armed { color: var(--error-color, #db4437); }
        .paused { color: var(--secondary-text-color); --mdc-icon-size: 14px; flex: none; }
        .empty {
          font-size: 13px; color: var(--secondary-text-color); padding: 4px 0;
        }
      </style>
      <ha-card>
        <div class="head" id="head" hidden>
          <ha-icon id="head-icon"></ha-icon><span id="head-title"></span>
        </div>
        <div id="body"></div>
      </ha-card>
    `;
  }

  _collect() {
    const now = Date.now() / 1000;
    const out = [];
    const seen = new Set();

    for (const src of this._config.sources) {
      const state = this._hass.states[src.entity];
      if (!state) continue;
      const attrs = state.attributes || {};

      if (Array.isArray(attrs.timers)) {
        for (const timer of attrs.timers) {
          const key = timer.timer_id;
          const total = parseDuration(timer.duration);
          const paused = timer.status && timer.status !== "set";
          let remaining;

          if (paused) {
            // U pozastaveneho casovace neni fire_time platny a vyznam
            // atributu duration je nejednoznacny — drzime posledni
            // zname zbyvajici cas z doby, kdy casovac jeste bezel.
            const frozen = this._frozen.get(key);
            remaining = frozen === undefined ? total : frozen;
          } else {
            remaining = Number(timer.fire_time || 0) - now;
            this._frozen.set(key, remaining);
          }

          seen.add(key);
          out.push({
            key,
            domain: "google_home",
            source: src.entity,
            timerId: timer.timer_id,
            icon: src.icon,
            total,
            remaining,
            paused,
          });
        }
        continue;
      }

      if (src.entity.startsWith("timer.")) {
        if (state.state === "idle") continue;
        const paused = state.state === "paused";
        seen.add(src.entity);
        out.push({
          key: src.entity,
          domain: "timer",
          source: src.entity,
          timerId: null,
          icon: src.icon,
          total: parseDuration(attrs.duration),
          remaining: paused
            ? parseDuration(attrs.remaining)
            : (Date.parse(attrs.finishes_at) || 0) / 1000 - now,
          paused,
        });
      }
    }

    for (const key of this._frozen.keys()) {
      if (!seen.has(key)) this._frozen.delete(key);
    }

    const live = out.filter(
      (timer) => timer.paused || timer.remaining > -this._config.linger_seconds
    );
    live.sort((a, b) => a.remaining - b.remaining);

    return this._config.max_timers > 0
      ? live.slice(0, this._config.max_timers)
      : live;
  }

  _color(timer) {
    if (timer.paused) return "var(--secondary-text-color)";
    if (timer.remaining <= this._config.danger_seconds) {
      return "var(--error-color, #db4437)";
    }
    const ratio = timer.total > 0 ? timer.remaining / timer.total : 1;
    if (ratio <= this._config.warn_ratio) {
      return "var(--warning-color, #ffa600)";
    }
    return "var(--primary-color)";
  }

  _makeRow(timer) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <ha-icon class="ic"></ha-icon>
      <span class="set"></span>
      <div class="track"><div class="fill"></div></div>
      <ha-icon class="paused" icon="mdi:pause" hidden></ha-icon>
      <span class="rem"></span>
    `;

    const parts = {
      root: row,
      icon: row.querySelector(".ic"),
      set: row.querySelector(".set"),
      fill: row.querySelector(".fill"),
      pause: row.querySelector(".paused"),
      rem: row.querySelector(".rem"),
      cancel: null,
    };

    if (this._config.show_cancel) {
      const button = document.createElement("button");
      button.className = "cancel";
      button.title = "Zrusit casovac";
      button.setAttribute("aria-label", "Zrusit casovac");
      button.innerHTML = '<ha-icon icon="mdi:close"></ha-icon>';
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        this._onCancel(timer.key);
      });
      row.appendChild(button);
      parts.cancel = button;
    }

    return parts;
  }

  _onCancel(key) {
    const timer = this._collect().find((item) => item.key === key);
    if (!timer) return;

    if (this._config.confirm_cancel && !this._armed.has(key)) {
      this._armed.set(
        key,
        setTimeout(() => {
          this._armed.delete(key);
          this._render();
        }, 3000)
      );
      this._render();
      return;
    }

    clearTimeout(this._armed.get(key));
    this._armed.delete(key);

    if (timer.domain === "google_home") {
      this._hass.callService("google_home", "delete_timer", {
        entity_id: timer.source,
        timer_id: timer.timerId,
      });
    } else {
      this._hass.callService("timer", "cancel", { entity_id: timer.source });
    }
  }

  _render() {
    if (!this._hass || !this._config) return;

    const timers = this._collect();
    const body = this.shadowRoot.getElementById("body");
    const head = this.shadowRoot.getElementById("head");

    if (!timers.length) {
      if (this._config.hide_when_empty) {
        this.style.display = "none";
        return;
      }
      this.style.display = "";
      head.hidden = !this._config.title;
      body.innerHTML = '<div class="empty">Zadne casovace</div>';
      this._rows.clear();
      this._signature = "";
      return;
    }

    this.style.display = "";

    if (this._config.title) {
      head.hidden = false;
      this.shadowRoot.getElementById("head-title").textContent =
        this._config.title;
      this.shadowRoot
        .getElementById("head-icon")
        .setAttribute("icon", this._config.icon);
    } else {
      head.hidden = true;
    }

    const signature = timers.map((timer) => timer.key).join("|");
    if (signature !== this._signature) {
      body.innerHTML = "";
      this._rows.clear();
      for (const timer of timers) {
        const parts = this._makeRow(timer);
        this._rows.set(timer.key, parts);
        body.appendChild(parts.root);
      }
      this._signature = signature;
    }

    for (const timer of timers) {
      const parts = this._rows.get(timer.key);
      if (!parts) continue;

      const remaining = Math.max(0, timer.remaining);
      const ratio = timer.total > 0 ? remaining / timer.total : 0;

      parts.icon.setAttribute("icon", timer.icon);
      parts.set.textContent = formatClock(timer.total);
      parts.fill.style.width = `${Math.min(100, ratio * 100)}%`;
      parts.fill.style.background = this._color(timer);
      parts.fill.classList.toggle("frozen", timer.paused);
      parts.pause.hidden = !timer.paused;
      parts.rem.textContent = formatClock(remaining);
      parts.rem.style.color =
        !timer.paused && remaining <= this._config.danger_seconds
          ? "var(--error-color, #db4437)"
          : "var(--primary-text-color)";

      if (parts.cancel) {
        const armed = this._armed.has(timer.key);
        parts.cancel.classList.toggle("armed", armed);
        parts.cancel
          .querySelector("ha-icon")
          .setAttribute("icon", armed ? "mdi:close-circle" : "mdi:close");
        parts.cancel.title = armed ? "Potvrd zruseni" : "Zrusit casovac";
      }
    }
  }
}

class CompactTimersCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._built = false;
  }

  setConfig(config) {
    this._config = Object.assign({}, DEFAULTS, config);
    this._config.entities = config.entities || [];
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  get _sources() {
    return normalizeSources(this._config.entities, this._config.icon);
  }

  _schema() {
    const candidates = Object.keys(this._hass ? this._hass.states : {})
      .filter(isTimerSource)
      .sort();

    return [
      {
        name: "entities",
        required: true,
        selector: {
          entity: { multiple: true, include_entities: candidates },
        },
      },
      { name: "title", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      {
        type: "grid",
        name: "",
        schema: [
          { name: "hide_when_empty", selector: { boolean: {} } },
          { name: "show_cancel", selector: { boolean: {} } },
          { name: "confirm_cancel", selector: { boolean: {} } },
          {
            name: "max_timers",
            selector: { number: { min: 0, max: 20, mode: "box" } },
          },
          {
            name: "danger_seconds",
            selector: { number: { min: 0, max: 120, mode: "box" } },
          },
          {
            name: "warn_ratio",
            selector: { number: { min: 0, max: 1, step: 0.05, mode: "box" } },
          },
        ],
      },
    ];
  }

  _build() {
    this.innerHTML = `
      <style>
        .ctc-icons {
          margin-top: 12px; padding-top: 12px;
          border-top: 1px solid var(--divider-color);
        }
        .ctc-icons h4 {
          margin: 0 0 4px; font-size: 14px; font-weight: 500;
          color: var(--primary-text-color);
        }
        .ctc-icons p {
          margin: 0 0 8px; font-size: 12px;
          color: var(--secondary-text-color);
        }
        .ctc-icon-row { margin-bottom: 8px; }
      </style>
      <ha-form id="ctc-form"></ha-form>
      <div class="ctc-icons">
        <h4>Ikony zdrojů</h4>
        <p>Prázdné pole převezme výchozí ikonu řádku.</p>
        <div id="ctc-icon-list"></div>
      </div>
    `;

    const form = this.querySelector("#ctc-form");
    form.computeLabel = (item) => LABELS[item.name] || item.name;
    form.addEventListener("value-changed", (event) => {
      event.stopPropagation();
      this._onFormChange(event.detail.value);
    });

    this._built = true;
  }

  _onFormChange(value) {
    const previous = new Map(this._sources.map((src) => [src.entity, src.icon]));
    const fallback = value.icon || DEFAULTS.icon;

    const entities = (value.entities || []).map((entityId) => {
      const icon = previous.get(entityId);
      return icon && icon !== fallback ? { entity: entityId, icon } : entityId;
    });

    this._emit(Object.assign({}, this._config, value, { entities }));
  }

  _onIconChange(entityId, icon) {
    const fallback = this._config.icon || DEFAULTS.icon;
    const entities = this._sources.map((src) => {
      const next = src.entity === entityId ? icon : src.icon;
      return next && next !== fallback
        ? { entity: src.entity, icon: next }
        : src.entity;
    });

    this._emit(Object.assign({}, this._config, { entities }));
  }

  _emit(config) {
    this._config = config;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      })
    );
    this._update();
  }

  _update() {
    if (!this._hass || !this._config) return;
    if (!this._built) this._build();

    const form = this.querySelector("#ctc-form");
    form.hass = this._hass;
    form.schema = this._schema();
    form.data = Object.assign({}, this._config, {
      entities: this._sources.map((src) => src.entity),
    });

    const list = this.querySelector("#ctc-icon-list");
    const sources = this._sources;
    const signature = sources.map((src) => src.entity).join("|");

    if (list.dataset.signature !== signature) {
      list.innerHTML = "";
      for (const src of sources) {
        const state = this._hass.states[src.entity];
        const name =
          (state && state.attributes && state.attributes.friendly_name) ||
          src.entity;

        const wrapper = document.createElement("div");
        wrapper.className = "ctc-icon-row";

        const picker = document.createElement("ha-icon-picker");
        picker.hass = this._hass;
        picker.label = name;
        picker.value = src.icon;
        picker.addEventListener("value-changed", (event) => {
          event.stopPropagation();
          this._onIconChange(src.entity, event.detail.value);
        });

        wrapper.appendChild(picker);
        list.appendChild(wrapper);
      }
      list.dataset.signature = signature;
    } else {
      const pickers = list.querySelectorAll("ha-icon-picker");
      sources.forEach((src, index) => {
        if (pickers[index]) pickers[index].value = src.icon;
      });
    }
  }
}

customElements.define("compact-timers-card", CompactTimersCard);
customElements.define("compact-timers-card-editor", CompactTimersCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "compact-timers-card",
  name: "Compact Timers Card",
  description:
    "Kompaktni odpocet casovacu Google Home / Nest a nativnich timer entit.",
  preview: true,
  documentationURL: "https://github.com/hruskin/ha-compact-timers-card",
});
