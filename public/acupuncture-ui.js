import { assetURL } from "./asset-url.js";
import { escapeHTML } from "./catalog.js";
import { findAcupoints, pointLabel, SIDE_NAMES } from "./acupoint-data.js";
import { AcupunctureOverlay } from "./acupuncture-scene.js";
const $ = (s) => document.querySelector(s);
export class AcupunctureMenu {
  constructor(viewer, catalog, hooks) {
    this.viewer = viewer;
    this.catalog = catalog;
    this.hooks = hooks;
    this.active = false;
    this.meridian = "LI";
    this.side = "both";
    this.selected = null;
    this.selectedSide = "left";
    this.limit = 80;
    this.quiz = null;
    try {
      this.favorites = JSON.parse(
        localStorage.getItem("human-acupoint-favorites") || "[]",
      ).filter((c) => catalog.points.some((p) => p.code === c));
    } catch {
      this.favorites = [];
    }
    this.overlay = new AcupunctureOverlay(
      viewer,
      catalog,
      (p, s) => {
        if (!this.quiz) this.select(p, s);
      },
      (position) => this.project(position),
    );
    this.build();
  }
  static async create(viewer, hooks) {
    const response = await fetch(assetURL("acupuncture/catalog.json"));
    if (!response.ok) throw Error("経穴データを取得できませんでした");
    const catalog = await response.json();
    if (catalog.points.length !== 361 || catalog.meridians.length !== 14)
      throw Error("経穴データの形式を確認できません");
    return new AcupunctureMenu(viewer, catalog, hooks);
  }
  build() {
    const options =
      '<option value="all">すべて · 361穴</option>' +
      this.catalog.meridians
        .map(
          (m) =>
            '<option value="' +
            m.code +
            '">' +
            m.code +
            " · " +
            m.name +
            "（" +
            m.count +
            "穴）</option>",
        )
        .join("");
    $("#acupuncture-panel").innerHTML =
      `<div class="acu-heading"><span class="section-kicker">KANJI ↔ INTERNATIONAL CODE</span><h2>経穴マップ</h2><p>WHO標準361穴 · 漢字とコードの対応</p></div><div class="acu-browser"><label class="acu-search-label">漢字・読み・コードで検索<input id="acu-search" placeholder="合谷・LI4・ごうこく" autocomplete="off" spellcheck="false"></label><label class="acu-filter-label">経脈<select id="acu-meridian">${options}</select></label><div class="acu-side-options" role="group" aria-label="経穴の左右表示"><button data-acu-side="both" class="active" aria-pressed="true">左右</button><button data-acu-side="left" aria-pressed="false">左</button><button data-acu-side="right" aria-pressed="false">右</button></div><label class="acu-favorites-only"><input id="acu-only-favorites" type="checkbox"> お気に入りだけ</label><div id="acu-result-count" role="status"></div><div id="acu-list"></div><button id="acu-more" hidden>さらに表示</button><button id="acu-start-study" class="acu-study-button">漢字とコードを練習する →</button></div><section id="acu-study" hidden><div class="acu-study-top"><span>対応を覚える</span><button id="acu-end-study">終了 ×</button></div><label class="acu-filter-label">出題方向<select id="acu-study-direction"><option value="kanji-code">漢字 → コード</option><option value="code-kanji">コード → 漢字</option></select></label><div id="acu-study-score"></div><h3 id="acu-question"></h3><div id="acu-answers"></div><p id="acu-study-feedback" role="status"></p><button id="acu-next-question" hidden>次の問題 →</button></section><div class="acu-footnote"><strong>位置は学習用の概略です</strong><p>WHOが配布した3D座標ではありません。漢字名とコードの対応を学ぶ表示です。</p><button id="acu-sources">出典・範囲・ライセンス ↗</button><small>お気に入りはこの端末に保存されます。</small></div>`;
    $("#acu-mobile-meridian").innerHTML = options;
    $("#acu-meridian").value = this.meridian;
    $("#acu-mobile-meridian").value = this.meridian;
    $("#acu-search").oninput = () => {
      this.limit = 80;
      this.renderList();
    };
    $("#acu-meridian").onchange = (e) => this.setMeridian(e.target.value);
    $("#acu-mobile-meridian").onchange = (e) =>
      this.setMeridian(e.target.value);
    $("#acu-only-favorites").onchange = () => {
      if ($("#acu-only-favorites").checked) {
        this.meridian = "all";
        this.renderFilters();
      }
      this.renderList();
    };
    $("#acu-more").onclick = () => {
      this.limit += 80;
      this.renderList();
    };
    document.querySelectorAll("[data-acu-side]").forEach(
      (b) =>
        (b.onclick = () => {
          this.side = b.dataset.acuSide;
          this.renderFilters();
          if (this.selected && this.side !== "both")
            this.select(this.selected, this.side);
        }),
    );
    $("#acu-list").onclick = (e) => {
      const b = e.target.closest("[data-acu-code]");
      if (b)
        this.select(
          this.point(b.dataset.acuCode),
          this.side === "right" ? "right" : "left",
        );
    };
    document
      .querySelectorAll("[data-acu-popular]")
      .forEach(
        (b) =>
          (b.onclick = () => this.select(this.point(b.dataset.acuPopular))),
      );
    $("#acu-close-detail").onclick = () => this.clearSelection();
    $("#acu-focus").onclick = () =>
      this.overlay.select(this.selected, this.selectedSide, true);
    $("#acu-point-prev").onclick = () => this.step(-1);
    $("#acu-point-next").onclick = () => this.step(1);
    $("#acu-favorite").onclick = () => this.favorite();
    $("#acu-copy-link").onclick = () => this.copyLink();
    $("#acu-detail-left").onclick = () => this.select(this.selected, "left");
    $("#acu-detail-right").onclick = () => this.select(this.selected, "right");
    $("#acu-sources").onclick = () => this.sources();
    $("#acu-detail-source").onclick = () => this.sources();
    $("#acu-start-study").onclick = () => this.startQuiz();
    $("#acu-end-study").onclick = () => this.endQuiz();
    $("#acu-next-question").onclick = () => this.question();
    $("#acu-study-direction").onchange = () => {
      if (this.quiz) this.question();
    };
    this.renderFilters();
    this.renderList();
  }
  point(code) {
    return this.catalog.points.find((p) => p.code === code);
  }
  async enter() {
    if (this.active) return;
    this.snapshot = {
      enabled: this.hooks.getLayers(),
      entry: this.hooks.getSelection(),
      view:
        document.querySelector("[data-view].active")?.dataset.view || "front",
      hidden: [...this.viewer.hiddenParts],
      selected: [...this.viewer.selected],
      isolated: this.viewer.isolated,
      opacity: this.viewer.masterOpacity,
      separation: this.viewer.separation,
      clipping: this.viewer.clipping,
      normal: this.viewer.clipPlane.normal.clone(),
      constant: this.viewer.clipPlane.constant,
      autoRotate: this.viewer.controls.autoRotate,
      position: this.viewer.camera.position.clone(),
      target: this.viewer.controls.target.clone(),
    };
    this.hooks.resetAnatomy();
    this.viewer.controls.autoRotate = false;
    this.viewer.setClip(false, "x", 0);
    this.viewer.setSeparation(0);
    for (const mesh of this.viewer.layers.values()) mesh.position.set(0, 0, 0);
    this.viewer.setOpacity(1);
    this.viewer.hiddenParts = new Set(["FJ2812", "FJ2813", "FJ2815"]);
    this.viewer.setSelection([]);
    const ok = await this.hooks.setLayers(["integumentary"], true);
    if (!ok) {
      await this.leave(true);
      throw Error(
        "体表モデルを取得できませんでした。オンラインで再度お試しください。",
      );
    }
    this.active = true;
    document.body.classList.add("acupuncture-mode");
    $("#anatomy-panel").hidden = true;
    $("#acupuncture-panel").hidden = false;
    $("#acu-overview").hidden = false;
    $("#acu-detail").hidden = true;
    this.overlay.show();
    this.viewer.reset();
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === "front");
      b.setAttribute("aria-pressed", String(b.dataset.view === "front"));
    });
    if (this.selected) this.select(this.selected, this.selectedSide, true);
    this.hooks.closeMenu();
  }
  async leave(force = false) {
    if (!this.active && !force) return;
    this.endQuiz();
    this.active = false;
    this.overlay.hide();
    document.body.classList.remove("acupuncture-mode");
    $("#anatomy-panel").hidden = false;
    $("#acupuncture-panel").hidden = true;
    $("#acu-detail").hidden = true;
    $("#acu-overview").hidden = true;
    $("#acu-tag").hidden = true;
    const s = this.snapshot;
    if (s) {
      this.viewer.hiddenParts = new Set(s.hidden);
      this.viewer.setSelection(s.selected);
      this.viewer.setIsolation(s.isolated);
      this.viewer.setOpacity(s.opacity);
      this.viewer.setSeparation(s.separation);
      this.viewer.clipPlane.set(s.normal, s.constant);
      this.viewer.setClip(s.clipping, "x", 0);
      this.viewer.clipPlane.set(s.normal, s.constant);
      this.viewer.controls.autoRotate = s.autoRotate;
      await this.hooks.setLayers(s.enabled, true);
      if (s.entry) await this.hooks.restoreSelection(s.entry, s.isolated);
      $("#auto-rotate").setAttribute("aria-pressed", String(s.autoRotate));
      document.querySelectorAll("[data-view]").forEach((b) => {
        b.classList.toggle("active", b.dataset.view === s.view);
        b.setAttribute("aria-pressed", String(b.dataset.view === s.view));
      });
      this.viewer.animateCamera(s.position, s.target);
    }
  }
  renderFilters() {
    $("#acu-meridian").value = this.meridian;
    $("#acu-mobile-meridian").value = this.meridian;
    document.querySelectorAll("[data-acu-side]").forEach((b) => {
      const active = b.dataset.acuSide === this.side;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    this.overlay.setFilter(this.meridian, this.side);
  }
  setMeridian(code) {
    this.meridian = code;
    $("#acu-search").value = "";
    this.limit = 80;
    if (this.selected && code !== "all" && this.selected.meridian !== code)
      this.clearSelection();
    this.renderFilters();
    this.renderList();
  }
  renderList() {
    let points = findAcupoints(
      this.catalog,
      $("#acu-search").value,
      this.meridian,
    );
    if ($("#acu-only-favorites").checked)
      points = points.filter((p) => this.favorites.includes(p.code));
    this.results = points;
    $("#acu-result-count").textContent =
      points.length +
      "穴" +
      (points.length > this.limit ? " · " + this.limit + "穴を表示" : "");
    $("#acu-list").innerHTML =
      points
        .slice(0, this.limit)
        .map(
          (p) =>
            `<button class="acu-point-row ${this.selected?.code === p.code ? "selected" : ""}" data-acu-code="${p.code}"><span><strong>${escapeHTML(p.ja)}</strong><small>${escapeHTML(p.reading)}</small></span><b>${p.code}</b>${this.favorites.includes(p.code) ? "<i>★</i>" : ""}</button>`,
        )
        .join("") ||
      (this.favorites.length || !$("#acu-only-favorites").checked
        ? '<p class="search-empty">一致する経穴がありません。<br>LI4、合谷などで検索できます。</p>'
        : '<p class="search-empty">経穴を選び、☆で保存できます。</p>');
    $("#acu-more").hidden = points.length <= this.limit;
  }
  select(point, side = "left", focus = true) {
    if (!point) return;
    this.selected = point;
    this.selectedSide = point.midline ? "midline" : side;
    if (this.meridian !== "all" && this.meridian !== point.meridian)
      this.meridian = point.meridian;
    if (this.side !== "both" && !point.midline) this.side = side;
    this.renderFilters();
    $("#acu-tag").hidden = true;
    this.overlay.select(point, this.selectedSide, focus);
    this.renderList();
    $("#acu-overview").hidden = true;
    $("#acu-detail").hidden = false;
    $("#acu-point-name").textContent = point.ja;
    $("#acu-point-code").textContent = point.code;
    $("#acu-point-reading").textContent = point.reading;
    const m = this.catalog.meridians.find((m) => m.code === point.meridian);
    $("#acu-point-meridian").textContent =
      m.fullName + " · " + point.number + " / " + m.count;
    $("#acu-point-location").textContent =
      point.placement === "intraoral-unmapped"
        ? "口腔内の穴です。この体表モデルの顔面にはマーカーを置いていません。"
        : "体表上の位置は学習用の概略です。WHOの3D座標・標準取穴位置の認証ではありません。";
    $("#acu-detail-sides").hidden = point.midline;
    $("#acu-detail-left").classList.toggle(
      "active",
      this.selectedSide === "left",
    );
    $("#acu-detail-right").classList.toggle(
      "active",
      this.selectedSide === "right",
    );
    $("#acu-point-prev").disabled = point.number === 1;
    $("#acu-point-next").disabled = point.number === m.count;
    $("#acu-favorite").textContent = this.favorites.includes(point.code)
      ? "★ 保存済み"
      : "☆ お気に入り";
    $("#acu-favorite").setAttribute(
      "aria-pressed",
      String(this.favorites.includes(point.code)),
    );
    $("#acu-point-aliases").textContent = point.aliases.filter((a) =>
      /^[A-Z]+\d+$/.test(a),
    ).length
      ? "別表記：" +
        point.aliases.filter((a) => /^[A-Z]+\d+$/.test(a)).join(" / ")
      : "";
    this.hooks.closeMenu();
  }
  clearSelection() {
    this.selected = null;
    this.overlay.selected = null;
    this.overlay.refresh();
    $("#acu-detail").hidden = true;
    $("#acu-tag").hidden = true;
    $("#acu-overview").hidden = false;
    this.renderList();
  }
  step(delta) {
    if (!this.selected) return;
    this.select(
      this.point(this.selected.meridian + (this.selected.number + delta)),
      this.selectedSide,
    );
  }
  project(position) {
    const tag = $("#acu-tag");
    if (!this.active || !position || this.quiz) {
      tag.hidden = true;
      return;
    }
    tag.hidden = false;
    tag.querySelector("strong").textContent = pointLabel(position.point);
    tag.querySelector("small").textContent =
      SIDE_NAMES[position.side] + " · 概略位置";
    tag.style.left =
      Math.max(
        12,
        Math.min(position.x + 18, this.viewer.host.clientWidth - 180),
      ) + "px";
    tag.style.top =
      Math.max(
        70,
        Math.min(position.y - 55, this.viewer.host.clientHeight - 140),
      ) + "px";
  }
  favorite() {
    if (!this.selected) return;
    const code = this.selected.code,
      next = this.favorites.includes(code)
        ? this.favorites.filter((c) => c !== code)
        : [...this.favorites, code];
    try {
      localStorage.setItem("human-acupoint-favorites", JSON.stringify(next));
      this.favorites = next;
      this.select(this.selected, this.selectedSide, false);
    } catch {
      this.hooks.toast("お気に入りを保存できませんでした");
    }
  }
  async copyLink() {
    if (!this.selected) return;
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set("mode", "acupuncture");
    url.searchParams.set("point", this.selected.code);
    url.searchParams.set("side", this.selectedSide);
    try {
      await navigator.clipboard.writeText(url.href);
      this.hooks.toast("この経穴へのリンクをコピーしました");
    } catch {
      this.hooks.toast("リンクをコピーできませんでした");
    }
  }
  sources() {
    const links = this.catalog.sources.filter(
      (s) =>
        s.id === "who-2008" ||
        s.id === "jic-positions" ||
        s.id === "wikipedia-" + (this.selected?.meridian || this.meridian),
    );
    this.hooks.showInfo(
      '<span class="section-kicker">SOURCES & SCOPE</span><h2>経穴マップの基準と位置</h2><p>WHO標準の14経脈・361穴のコードを基準に、日本語の漢字名・読みを対応させています。コードは英単語名ではなく国際的な識別番号です。</p><p><strong>WHO配布の3D座標は確認できていません。</strong>この位置表示は、未監修の教育用座標を人体表面へ再投影した概略です。標準取穴・施術位置の決定には使えません。</p><p>齦交（GV28）は口腔内のため体表マーカーを置きません。印堂（GV24+）など、対象361穴に含まれない番号は収録していません。</p><p>' +
        links
          .map(
            (s) =>
              '<a href="' +
              escapeHTML(s.url) +
              '" target="_blank" rel="noopener">' +
              escapeHTML(s.title) +
              "</a>",
          )
          .join("<br>") +
        '</p><p><a href="' +
        assetURL("acupuncture/SOURCES.md").href +
        '" target="_blank" rel="noopener">出典・変更内容・ライセンス一覧</a></p><p class="info-note">日本語名・読み：Wikipedia contributors, CC BY-SA 4.0。座標種：JIC contributors, MIT。人体表面：BodyParts3D © DBCLS, CC BY 4.0。派生データはCC BY-SA 4.0で公開しています。</p>',
    );
  }
  startQuiz() {
    this.quiz = { correct: 0, total: 0 };
    document.body.classList.add("acu-study-mode");
    $("#acu-study").hidden = false;
    this.hooks.openMenu();
    this.question();
  }
  endQuiz() {
    this.quiz = null;
    document.body.classList.remove("acu-study-mode");
    $("#acu-study").hidden = true;
    this.viewer.invalidate();
  }
  question() {
    if (!this.quiz) return;
    const pool = this.catalog.points.filter(
        (p) => this.meridian === "all" || p.meridian === this.meridian,
      ),
      point = pool[Math.floor(Math.random() * pool.length)];
    const other = pool
        .filter((p) => p.code !== point.code)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3),
      choices = [point, ...other].sort(() => Math.random() - 0.5),
      reverse = $("#acu-study-direction").value === "code-kanji";
    this.select(point, this.side === "right" ? "right" : "left", true);
    this.hooks.openMenu();
    $("#acu-question").textContent = reverse
      ? point.code + " の漢字名は？"
      : point.ja + " の国際コードは？";
    $("#acu-study-score").textContent =
      this.quiz.correct + " / " + this.quiz.total + " 正解";
    $("#acu-study-feedback").textContent = "";
    $("#acu-next-question").hidden = true;
    $("#acu-answers").innerHTML = choices
      .map(
        (p, i) =>
          '<button data-acu-answer="' +
          i +
          '">' +
          escapeHTML(reverse ? p.ja : p.code) +
          "</button>",
      )
      .join("");
    let answered = false;
    $("#acu-answers").onclick = (e) => {
      const b = e.target.closest("[data-acu-answer]");
      if (!b || answered) return;
      answered = true;
      this.quiz.total++;
      if (choices[Number(b.dataset.acuAnswer)].code === point.code)
        this.quiz.correct++;
      $("#acu-study-score").textContent =
        this.quiz.correct + " / " + this.quiz.total + " 正解";
      $("#acu-study-feedback").textContent = pointLabel(point);
      document.querySelectorAll("[data-acu-answer]").forEach((button, i) => {
        button.disabled = true;
        if (choices[i].code === point.code) button.classList.add("correct");
        else if (button === b) button.classList.add("incorrect");
      });
      $("#acu-next-question").hidden = false;
    };
  }
  focusSearch() {
    this.hooks.openMenu();
    $("#acu-search").focus();
  }
}
