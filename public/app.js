import { assetURL } from "./asset-url.js";
import { AnatomyScene } from "./scene.js";
import {
  LAYERS,
  FEATURED,
  japanese,
  escapeHTML,
  filterEntries,
} from "./catalog.js";
const $ = (s) => document.querySelector(s);
let atlas,
  viewer,
  selection = null,
  isolated = false,
  enabled = ["skeletal"],
  installPrompt,
  toastTimer;
const loading = new Map();
const loadingPhases = new Map();
let favorites = [];
try {
  const value = JSON.parse(localStorage.getItem("anatomia-favorites") || "[]");
  if (Array.isArray(value))
    favorites = value
      .filter(
        (e) => e && typeof e.name === "string" && Array.isArray(e.elements),
      )
      .slice(0, 100);
} catch {}
const advancedIds = Object.keys(LAYERS).filter(
  (id) => !["skeletal", "muscular", "organs"].includes(id),
);
$("#advanced-systems").innerHTML = advancedIds
  .map(
    (id) =>
      '<button class="system small-system" data-layer="' +
      id +
      '" aria-pressed="false"><span class="system-copy"><strong>' +
      LAYERS[id].ja +
      "</strong><small>" +
      LAYERS[id].en +
      '</small></span><span class="system-toggle"></span></button>',
  )
  .join("");

function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function showError(error) {
  $("#loader").hidden = true;
  $("#error-panel").hidden = false;
  $("#error-text").textContent =
    error instanceof Error ? error.message : String(error);
  $("#render-status").innerHTML = "<i></i> 読み込みを確認してください";
}
function updateLoader() {
  const pending = [...loading].filter(([, v]) => v < 100);
  $("#loader").hidden = pending.length === 0;
  if (pending.length) {
    const [id, progress] =
      pending.find(([, value]) => value > 1 && value < 100) || pending[0];
    $("#loading-text").textContent =
      LAYERS[id].ja +
      " · " +
      (loadingPhases.get(id) || "準備中") +
      " " +
      Math.round(progress) +
      "%";
    $("#progress").style.width = progress + "%";
  } else if (viewer) {
    const count = atlas.parts.filter((p) => enabled.includes(p.layer)).length;
    $("#render-status").innerHTML =
      "<i></i> " + count.toLocaleString() + " STRUCTURES · 3D READY";
  }
}
function renderState() {
  document.querySelectorAll("[data-layer]").forEach((b) => {
    const active = enabled.includes(b.dataset.layer);
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  document
    .querySelectorAll("[data-preset]")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        b.dataset.preset === "all"
          ? enabled.length === 3
          : enabled.length === 1 && enabled[0] === b.dataset.preset,
      ),
    );
  $("#current-system").textContent = enabled
    .map((id) => LAYERS[id].ja)
    .join(" ＋ ");
  updateLoader();
  if (atlas) makeQuickList();
}
async function enableLayers(ids) {
  enabled = ids;
  renderState();
  try {
    await viewer.setEnabled(ids);
  } catch (e) {
    showError(e);
  }
}
function closeMenu() {
  $("#sidebar").classList.remove("open");
  $("#menu").setAttribute("aria-expanded", "false");
}
function resetSelection() {
  document.body.classList.remove("quiz-mode");
  $("#quiz-card").hidden = true;
  selection = null;
  isolated = false;
  viewer.setIsolation(false);
  viewer.setSelection([]);
  $("#inspector-empty").hidden = false;
  $("#inspector-detail").hidden = true;
  $("#close-detail").hidden = true;
  $("#selection-label").hidden = true;
  $("#detail-kicker").textContent = "DISCOVER YOUR ANATOMY";
  $("#isolate").setAttribute("aria-pressed", "false");
  $("#isolate").textContent = "◇ 単独表示";
}
async function select(entry, focus = false, forQuiz = false) {
  if (!forQuiz && document.body.classList.contains("quiz-mode"))
    resetSelection();
  if (!viewer) return;
  const ids = entry.elements || [entry.id];
  const valid = ids.filter(
    (id) =>
      viewer.partIndex.has(id) &&
      (!entry.layer ||
        atlas.parts[viewer.partIndex.get(id)].layer === entry.layer),
  );
  if (!valid.length) {
    toast("この構造のモデルは含まれていません");
    return;
  }
  const parts = valid.map((id) => atlas.parts[viewer.partIndex.get(id)]),
    layers = [...new Set(parts.map((p) => p.layer))];
  selection = { ...entry, elements: valid };
  updateFavoriteButton();
  isolated = false;
  viewer.setIsolation(false);
  viewer.setSelection(valid);
  $("#inspector-empty").hidden = true;
  $("#inspector-detail").hidden = false;
  $("#close-detail").hidden = false;
  const label = entry.ja || japanese(entry.name);
  $("#part-title").textContent = label;
  $("#part-english").textContent =
    label === entry.name ? "SOURCE ANATOMICAL NAME" : entry.name;
  $("#detail-kicker").textContent = "STRUCTURE / " + LAYERS[parts[0].layer].en;
  $("#part-tags").innerHTML =
    layers.map((id) => "<span>" + LAYERS[id].ja + "</span>").join("") +
    (valid.length > 1 ? "<span>" + valid.length + " メッシュ</span>" : "");
  $("#part-description").textContent =
    entry.description ||
    FEATURED.find((f) => f.name === entry.name.toLowerCase())?.description ||
    LAYERS[parts[0].layer].description;
  $("#part-source").textContent =
    "BodyParts3D 4.0 · " + (entry.id || parts[0].conceptId) + " · CC BY 4.0";
  $("#isolate").setAttribute("aria-pressed", "false");
  $("#isolate").textContent = "◇ 単独表示";
  $("#selection-label strong").textContent = label;
  $("#selection-label small").textContent = entry.name;
  $("#selection-label").hidden = false;
  closeMenu();
  if (!layers.every((l) => enabled.includes(l))) await enableLayers(layers);
  if (focus) viewer.focus(valid);
}
function makeQuickList() {
  const list = FEATURED.filter((f) => enabled.includes(f.layer));
  $("#quick-list").innerHTML = list
    .map(
      (f, i) =>
        '<button class="quick-item" data-feature="' +
        FEATURED.indexOf(f) +
        '"><span class="quick-index">' +
        String(i + 1).padStart(2, "0") +
        "</span><span><strong>" +
        f.ja +
        "</strong><small>" +
        f.name.toUpperCase() +
        '</small></span><span class="quick-arrow">↗</span></button>',
    )
    .join("");
}
$("#menu").onclick = () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#menu").setAttribute("aria-expanded", String(open));
};
$("#canvas-host").addEventListener("pointerdown", closeMenu);
$("#retry").onclick = () => location.reload();
$("#quick-list").onclick = (e) => {
  const b = e.target.closest("[data-feature]");
  if (!b || !atlas) return;
  const f = FEATURED[Number(b.dataset.feature)],
    concept = atlas.concepts.find((c) => c.name.toLowerCase() === f.name);
  if (concept) select({ ...concept, ...f }, true);
};
$("#search").oninput = () => {
  if (!atlas) return;
  const q = $("#search").value.trim();
  $("#quick-list").hidden = !!q;
  $("#search-results").hidden = !q;
  if (!q) return;
  const features = FEATURED.filter((f) =>
    (f.ja + " " + f.name).toLowerCase().includes(q.toLowerCase()),
  ).map((f) => ({
    ...atlas.concepts.find((c) => c.name.toLowerCase() === f.name),
    ...f,
  }));
  const entries = [...features, ...filterEntries(atlas.parts, q)].slice(0, 30);
  $("#search-results").innerHTML = entries.length
    ? entries
        .map(
          (e, i) =>
            '<button class="quick-item" data-result="' +
            i +
            '"><span class="quick-index">◎</span><span><strong>' +
            escapeHTML(e.ja || japanese(e.name)) +
            "</strong><small>" +
            escapeHTML(e.name) +
            '</small></span><span class="quick-arrow">↗</span></button>',
        )
        .join("")
    : '<p class="search-empty">一致する部位がありません。<br>頭蓋骨・心臓・femur などで検索できます。<br>未翻訳の部位は英語名で検索してください。</p>';
  $("#search-results").onclick = (e) => {
    const b = e.target.closest("[data-result]");
    if (b) select(entries[Number(b.dataset.result)], true);
  };
};
document.querySelectorAll("[data-layer]").forEach(
  (b) =>
    (b.onclick = () => {
      if (!viewer) return;
      const id = b.dataset.layer,
        next = enabled.includes(id)
          ? enabled.filter((x) => x !== id)
          : [...enabled, id];
      if (!next.length) {
        toast("少なくとも1つのシステムを表示してください");
        return;
      }
      resetSelection();
      enableLayers(next);
      makeQuickList();
    }),
);
document.querySelectorAll("[data-preset]").forEach(
  (b) =>
    (b.onclick = () => {
      if (!viewer) return;
      resetSelection();
      enableLayers(
        b.dataset.preset === "all"
          ? ["skeletal", "muscular", "organs"]
          : [b.dataset.preset],
      );
      makeQuickList();
    }),
);
$("#close-detail").onclick = () => {
  resetSelection();
  viewer.reset();
};
$("#clear-selection").onclick = () => {
  if (viewer) {
    resetSelection();
    viewer.reset();
  }
};
$("#focus-part").onclick = () => {
  if (selection) viewer.focus(selection.elements);
};
$("#isolate").onclick = () => {
  if (!selection) return;
  isolated = !isolated;
  viewer.setIsolation(isolated);
  $("#isolate").setAttribute("aria-pressed", String(isolated));
  $("#isolate").textContent = isolated ? "◇ 全体に戻す" : "◇ 単独表示";
  if (isolated) viewer.focus(selection.elements);
};
$("#zoom-in").onclick = () => viewer?.zoom(0.83);
$("#zoom-out").onclick = () => viewer?.zoom(1.2);
$("#reset-camera").onclick = () => {
  if (viewer) {
    resetSelection();
    viewer.reset();
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === "front");
      b.setAttribute("aria-pressed", String(b.dataset.view === "front"));
    });
  }
};
document.querySelectorAll("[data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      if (!viewer) return;
      viewer.reset(true, b.dataset.view);
      document.querySelectorAll("[data-view]").forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
    }),
);
$("#auto-rotate").onclick = () => {
  if (!viewer) return;
  viewer.controls.autoRotate = !viewer.controls.autoRotate;
  $("#auto-rotate").setAttribute(
    "aria-pressed",
    String(viewer.controls.autoRotate),
  );
  viewer.invalidate();
};
$("#opacity").oninput = () => {
  const value = Number($("#opacity").value);
  $("#opacity-value").textContent = value + "%";
  viewer?.setOpacity(value / 100);
};
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("このブラウザでは全画面表示が利用できません");
  }
};
function showInfo(html) {
  $("#info-content").innerHTML = html;
  $("#info-dialog").showModal();
}
$("#close-info").onclick = () => $("#info-dialog").close();
$("#info-dialog").onclick = (e) => {
  if (e.target === $("#info-dialog")) $("#info-dialog").close();
};
$("#help").onclick = () =>
  showInfo(
    '<span class="section-kicker">A CLOSER LOOK</span><h2>からだの探索ガイド</h2><ul><li>1本指のドラッグ・マウスドラッグで回転。</li><li>ピンチ・スクロールで拡大縮小。2本指のドラッグで移動。</li><li>部位をタップして選択。フォーカスで近づき、単独表示で周囲を隠せます。</li><li>骨格・筋肉・臓器を切り替えたり重ねたりできます。スマホの探索メニューからは個別に重ねられます。</li><li>未翻訳の細かい構造は英語名のまま表示しています。</li></ul><h2>スマホに追加</h2><p>iPhoneはSafariの共有 → ホーム画面に追加。AndroidはChromeのメニュー → アプリをインストール。最初に開いた各システムはキャッシュされ、次回からオフラインでも利用できます。</p><p class="info-note">学習用の参照ビューアです。医学教材としての監修は受けていません。モデルには省略や個体差があり、表示色は説明用です。</p>',
  );
$("#credits").onclick = () =>
  showInfo(
    '<span class="section-kicker">OPEN ANATOMY</span><h2>モデルの出典</h2><p>BodyParts3D 4.0<br>© The Database Center for Life Science<br>CC BY 4.0</p><p>Human Atlas の軽量化済みメッシュを元に、骨格・筋肉・臓器の3レイヤーへ再構成しています。元の形状と識別子を保持し、日本語の案内と一部の一般的な解説を追加しました。</p><p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0 ライセンス</a><br><a href="https://github.com/ashemag/human-atlas" target="_blank" rel="noopener">Human Atlas / モデル提供元</a><br><a href="./ATTRIBUTION.md" target="_blank">詳細な出典・加工内容</a></p><p class="info-note">成人男性の参照モデルです。すべての組織や個体差を網羅しません。日本語訳は主要部位のみで、細部は原典の英語名を表示します。診断や手術計画には使えません。</p>',
  );
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#sidebar").classList.add("open");
    $("#menu").setAttribute("aria-expanded", "true");
    $("#search").focus();
  }
  if (e.key === "Escape") closeMenu();
});
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#install").hidden = false;
});
$("#install").onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
    $("#install").hidden = true;
  }
};
(async () => {
  try {
    const response = await fetch(assetURL("models/atlas.json"));
    if (!response.ok) throw Error("部位データを読み込めませんでした");
    atlas = await response.json();
    viewer = new AnatomyScene($("#canvas-host"), atlas, {
      onSelect: (id) => {
        const part = atlas.parts.find((p) => p.id === id);
        if (part && !document.body.classList.contains("quiz-mode"))
          select(part);
      },
      onProgress: (id, value, phase) => {
        loadingPhases.set(id, phase);
        loading.set(id, value);
        updateLoader();
      },
      onError: showError,
      onReady: () => updateLoader(),
      onProject: (x, y, visible) => {
        const label = $("#selection-label");
        label.hidden = !selection || !visible;
        label.style.left =
          Math.max(34, Math.min(x + 35, $("#stage").clientWidth - 215)) + "px";
        label.style.top =
          Math.max(70, Math.min(y - 15, $("#stage").clientHeight - 150)) + "px";
      },
    });
    await enableLayers(["skeletal"]);
    makeQuickList();
  } catch (e) {
    showError(e);
  }
})();
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() => toast("オフライン保存を有効にできませんでした"));

function selectionKey(entry) {
  return entry?.id || entry?.name;
}
function updateFavoriteButton() {
  const active =
    !!selection &&
    favorites.some((e) => selectionKey(e) === selectionKey(selection));
  $("#favorite").setAttribute("aria-pressed", String(active));
  $("#favorite").textContent = active ? "★ 保存済み" : "☆ お気に入り";
}
function renderFavorites() {
  $("#favorite-count").textContent = favorites.length;
  $("#favorites-list").innerHTML = favorites.length
    ? favorites
        .map(
          (e, i) =>
            '<button class="quick-item" data-favorite="' +
            i +
            '"><span class="quick-index">☆</span><span><strong>' +
            escapeHTML(e.ja || japanese(e.name)) +
            "</strong><small>" +
            escapeHTML(e.name) +
            '</small></span><span class="quick-arrow">↗</span></button>',
        )
        .join("")
    : '<p class="search-empty">部位の詳細から保存できます。<br>この端末のブラウザに保存されます。</p>';
}
$("#favorite").onclick = () => {
  if (!selection) return;
  const key = selectionKey(selection),
    exists = favorites.some((e) => selectionKey(e) === key),
    next = exists
      ? favorites.filter((e) => selectionKey(e) !== key)
      : [...favorites, selection];
  try {
    localStorage.setItem("anatomia-favorites", JSON.stringify(next));
    favorites = next;
    renderFavorites();
    updateFavoriteButton();
    toast(exists ? "お気に入りから削除しました" : "お気に入りに保存しました");
  } catch {
    toast("保存できません。ブラウザの保存設定を確認してください");
  }
};
$("#favorites-list").onclick = (e) => {
  const b = e.target.closest("[data-favorite]");
  if (b && viewer) select(favorites[Number(b.dataset.favorite)], true);
};
renderFavorites();
$("#all-systems").onclick = () => {
  if (viewer) {
    resetSelection();
    enableLayers(Object.keys(LAYERS));
    makeQuickList();
    toast("全モデルを読み込みます。初回は約33MBの形状データを取得します");
  }
};
function toggleTools(open) {
  $("#advanced-tools").hidden = !open;
  $("#tools-toggle").setAttribute("aria-expanded", String(open));
}
$("#tools-toggle").onclick = () => toggleTools($("#advanced-tools").hidden);
$("#close-tools").onclick = () => toggleTools(false);
function updateClip() {
  viewer?.setClip(
    $("#clip-enabled").checked,
    $("#clip-axis").value,
    Number($("#clip-position").value),
  );
}
$("#clip-enabled").onchange = updateClip;
$("#clip-axis").onchange = updateClip;
$("#clip-position").oninput = updateClip;
$("#separation").oninput = () =>
  viewer?.setSeparation(Number($("#separation").value) / 100);
$("#separation").onchange = () => viewer?.reset();
$("#hide-part").onclick = () => {
  if (!viewer || !selection) return;
  const count = selection.elements.length;
  viewer.hideSelection();
  resetSelection();
  toast(count + "構造を非表示にしました。探索ツールから戻せます");
};
$("#restore-hidden").onclick = () => {
  viewer?.restoreHidden();
  toast("非表示にした構造を戻しました");
};
$("#snapshot").onclick = () => {
  if (!viewer) return;
  try {
    const a = document.createElement("a");
    a.href = viewer.snapshot();
    a.download = "anatomia-" + new Date().toISOString().slice(0, 10) + ".png";
    a.click();
    toast("出典表記付きの画像を保存しました");
  } catch {
    toast(
      "画像を保存できませんでした。ブラウザのスクリーンショットをご利用ください",
    );
  }
};
let quizAnswer = null,
  quizAnswered = false,
  quizCorrect = 0,
  quizTotal = 0;
async function quizQuestion() {
  const candidates = FEATURED.filter((f) =>
    atlas.concepts.some((c) => c.name.toLowerCase() === f.name),
  );
  quizAnswer = candidates[Math.floor(Math.random() * candidates.length)];
  const concept = atlas.concepts.find(
    (c) => c.name.toLowerCase() === quizAnswer.name,
  );
  const alternatives = candidates
    .filter((f) => f.name !== quizAnswer.name)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  const choices = [quizAnswer, ...alternatives].sort(() => Math.random() - 0.5);
  quizAnswered = false;
  $("#quiz-feedback").textContent = "";
  $("#next-question").hidden = true;
  $("#quiz-score").textContent = quizCorrect + " / " + quizTotal + " 正解";
  $("#quiz-choices").innerHTML = choices
    .map((f, i) => '<button data-answer="' + i + '">' + f.ja + "</button>")
    .join("");
  $("#quiz-card").hidden = false;
  document.body.classList.add("quiz-mode");
  await select({ ...concept, ...quizAnswer }, true, true);
  $("#quiz-choices").onclick = (e) => {
    const b = e.target.closest("[data-answer]");
    if (!b || quizAnswered) return;
    quizAnswered = true;
    quizTotal++;
    const correct = choices[Number(b.dataset.answer)].name === quizAnswer.name;
    if (correct) quizCorrect++;
    $("#quiz-feedback").textContent = correct
      ? "正解です。形と位置を覚えましょう。"
      : "正解は「" + quizAnswer.ja + "」です。";
    $("#quiz-score").textContent = quizCorrect + " / " + quizTotal + " 正解";
    document.querySelectorAll("[data-answer]").forEach((button, i) => {
      button.disabled = true;
      if (choices[i].name === quizAnswer.name) button.classList.add("correct");
      else if (button === b) button.classList.add("incorrect");
    });
    $("#next-question").hidden = false;
  };
}
$("#start-quiz").onclick = () => {
  if (!viewer) return;
  toggleTools(false);
  quizCorrect = 0;
  quizTotal = 0;
  viewer.restoreHidden();
  $("#clip-enabled").checked = false;
  updateClip();
  $("#separation").value = "0";
  viewer.setSeparation(0);
  quizQuestion();
};
$("#next-question").onclick = quizQuestion;
$("#end-quiz").onclick = () => {
  document.body.classList.remove("quiz-mode");
  $("#quiz-card").hidden = true;
  resetSelection();
  viewer?.reset();
};
