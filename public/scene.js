import * as T from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { mergeGeometries } from "./vendor/BufferGeometryUtils.js";
import { isTap } from "./catalog.js";
const COLORS = {
  arterial: "#b75d62",
  venous: "#648fb7",
  sensory: "#aabdc4",
  connective: "#bbc4b0",
  reproductive: "#b5959b",
  integumentary: "#bca18c",
  skeletal: "#dfd9bf",
  muscular: "#ac6460",
  cardiac: "#b56469",
  respiratory: "#c69baf",
  digestive: "#bc9279",
  urinary: "#b47164",
  nervous: "#d4bca4",
  endocrine: "#c0a7a0",
  lymphatic: "#9aab83",
};
export class AnatomyScene {
  constructor(
    host,
    atlas,
    { onSelect, onProgress, onError, onReady, onProject },
  ) {
    this.host = host;
    this.atlas = atlas;
    this.onSelect = onSelect;
    this.onProgress = onProgress;
    this.onError = onError;
    this.onReady = onReady;
    this.onProject = onProject;
    this.layers = new Map();
    this.loading = new Map();
    this.enabled = new Set(["skeletal"]);
    this.selected = new Set();
    this.isolated = false;
    this.hiddenParts = new Set();
    this.separation = 0;
    this.clipPlane = new T.Plane(new T.Vector3(1, 0, 0), 0);
    this.clipping = false;
    this.masterOpacity = 1;
    this.frame = 0;
    this.lastTime = performance.now();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, innerWidth < 900 ? 1.5 : 1.8),
    );
    this.renderer.setClearColor(0, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "人体の3Dモデル。ドラッグで回転、ピンチで拡大。部位は探索メニューからも選択できます。",
    );
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(32, 1, 0.01, 50);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 0.18;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI * 0.94;
    this.controls.enablePan = true;
    this.controls.zoomSpeed = 0.8;
    this.controls.rotateSpeed = 0.7;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.addEventListener("change", () => this.invalidate());
    this.controls.addEventListener("start", () => {
      this.cameraAnimation = null;
    });
    this.scene.add(new T.HemisphereLight(0xc9e7e0, 0x19323a, 1.5));
    const key = new T.DirectionalLight(0xfff1df, 2.8);
    key.position.set(-2, 3, 3);
    this.scene.add(key);
    const rim = new T.DirectionalLight(0x8dd4c5, 3);
    rim.position.set(2, 2, -2);
    this.scene.add(rim);
    const fill = new T.DirectionalLight(0xd1d7ef, 0.8);
    fill.position.set(0, 0.6, 4);
    this.scene.add(fill);
    const floor = new T.Mesh(
      new T.PlaneGeometry(2.4, 2.4),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader:
          "varying vec2 uvPos;void main(){uvPos=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec2 uvPos;void main(){float d=length(uvPos-.5)*2.;float a=pow(max(0.,1.-d),3.)*.7;gl_FragColor=vec4(.01,.03,.035,a);}",
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.007;
    this.scene.add(floor);
    for (const radius of [0.36, 0.48, 0.6]) {
      const ring = new T.Mesh(
        new T.RingGeometry(radius, radius + 0.0008, 96),
        new T.MeshBasicMaterial({
          color: 0x86b9aa,
          transparent: true,
          opacity: 0.17,
          side: T.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.006;
      this.scene.add(ring);
    }
    this.textureWidth = T.MathUtils.ceilPowerOfTwo(atlas.parts.length);
    this.selectionBytes = new Uint8Array(this.textureWidth * 4);
    this.selectionTexture = new T.DataTexture(
      this.selectionBytes,
      this.textureWidth,
      1,
    );
    this.selectionTexture.needsUpdate = true;
    this.partIndex = new Map(atlas.parts.map((p, i) => [p.id, i]));
    this.raycaster = new T.Raycaster();
    this.pointer = new T.Vector2();
    let start = null;
    const pointers = new Set();
    host.addEventListener("pointerdown", (e) => {
      pointers.add(e.pointerId);
      if (pointers.size === 1) start = { x: e.clientX, y: e.clientY, count: 1 };
      else if (start) start.count = pointers.size;
    });
    host.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(start.x - e.clientX, start.y - e.clientY) >= 8)
        start.moved = true;
    });
    host.addEventListener("pointercancel", (e) => {
      pointers.delete(e.pointerId);
      start = null;
    });
    host.addEventListener("pointerup", (e) => {
      pointers.delete(e.pointerId);
      if (!isTap(start, { x: e.clientX, y: e.clientY })) {
        start = null;
        return;
      }
      start = null;
      this.pick(e);
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.reset(false);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else this.invalidate();
    });
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.onError(
        "3Dの描画が中断されました。ほかのアプリを閉じて、再読み込みしてください。",
      );
    });
  }
  invalidate() {
    if (!this.frame && !document.hidden)
      this.frame = requestAnimationFrame((t) => this.render(t));
  }
  render(time) {
    this.frame = 0;
    const elapsed = Math.min((time - this.lastTime) / 1000, 1),
      dt = Math.min(elapsed, 0.05);
    this.lastTime = time;
    let moving = false;
    for (const [id, mesh] of this.layers) {
      const target = this.enabled.has(id)
        ? this.masterOpacity *
          (id === "integumentary" && this.enabled.size > 1 ? 0.08 : 1)
        : 0;
      const ids = [...this.enabled],
        index = ids.indexOf(id),
        angle = (index / Math.max(1, ids.length)) * Math.PI * 2;
      const destination = new T.Vector3(
        Math.sin(angle) * this.separation * 0.65,
        0,
        Math.cos(angle) * this.separation * 0.5,
      );
      const step = this.reduced ? 1 : 1 - Math.exp(-10 * elapsed);
      mesh.position.lerp(destination, step);
      if (mesh.position.distanceTo(destination) < 0.001)
        mesh.position.copy(destination);
      else moving = true;
      const value = this.reduced
        ? target
        : T.MathUtils.damp(mesh.material.opacity, target, 10, elapsed);
      mesh.material.opacity = Math.abs(value - target) < 0.003 ? target : value;
      mesh.visible = mesh.material.opacity > 0.001;
      mesh.material.depthWrite = mesh.material.opacity > 0.98;
      if (Math.abs(mesh.material.opacity - target) > 0.001) moving = true;
    }
    if (this.cameraAnimation) {
      const a = this.cameraAnimation,
        t = Math.min((time - a.start) / a.duration, 1),
        ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(a.fromPosition, a.toPosition, ease);
      this.controls.target.lerpVectors(a.fromTarget, a.toTarget, ease);
      if (t >= 1) this.cameraAnimation = null;
      else moving = true;
    }
    const controlsMoving = this.controls.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.selectionCenter && this.onProject) {
      const p = this.selectionCenter
        .clone()
        .add(this.layers.get(this.selectionLayer)?.position || new T.Vector3())
        .project(this.camera);
      this.onProject(
        ((p.x + 1) * this.host.clientWidth) / 2,
        ((-p.y + 1) * this.host.clientHeight) / 2,
        p.z > -1 && p.z < 1,
      );
    }
    if (moving || controlsMoving || this.controls.autoRotate) this.invalidate();
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const layout =
      (w < 700 ? "mobile" : "desktop") + (w > h ? "landscape" : "portrait");
    if (this.lastLayout !== layout) {
      this.lastLayout = layout;
      if (!this.selected.size) this.reset(false);
    }
    this.invalidate();
  }
  animateCamera(position, target, animated = true) {
    this.cameraAnimation =
      animated && !this.reduced
        ? {
            fromPosition: this.camera.position.clone(),
            toPosition: position,
            fromTarget: this.controls.target.clone(),
            toTarget: target,
            start: performance.now(),
            duration: 700,
          }
        : null;
    if (!this.cameraAnimation) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    }
    this.invalidate();
  }
  reset(animated = true, view = "front") {
    const mobile = this.host.clientWidth < 700,
      h = this.host.clientHeight;
    const distance =
      (1 + this.separation * 0.6) *
      (mobile ? Math.max(4.1, 3.9 * (650 / Math.max(450, h))) : 3.7);
    const target = new T.Vector3(0, mobile ? 0.71 : 0.85, 0);
    const direction =
      view === "back"
        ? new T.Vector3(0, 0.045, -1)
        : view === "side"
          ? new T.Vector3(1, 0.045, 0)
          : new T.Vector3(0, 0.045, 1);
    this.animateCamera(
      target.clone().addScaledVector(direction.normalize(), distance),
      target,
      animated,
    );
  }
  zoom(factor) {
    this.cameraAnimation = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.multiplyScalar(factor);
    offset.clampLength(this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset);
    this.invalidate();
  }
  async loadLayer(id) {
    if (this.layers.has(id)) return;
    if (this.loading.has(id)) return this.loading.get(id);
    const promise = this._loadLayer(id).finally(() => this.loading.delete(id));
    this.loading.set(id, promise);
    return promise;
  }
  async _loadLayer(id) {
    const layer = this.atlas.layers.find((l) => l.id === id);
    this.onProgress(id, 0);
    const response = await fetch(layer.url);
    if (!response.ok)
      throw Error(
        "モデルのダウンロードに失敗しました (" + response.status + ")",
      );
    let compressed;
    const length =
      Number(response.headers.get("content-length")) || layer.compressedBytes;
    if (response.body) {
      const reader = response.body.getReader(),
        chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        this.onProgress(id, Math.min(85, (received / length) * 85));
      }
      compressed = new Blob(chunks);
    } else compressed = await response.blob();
    if (typeof DecompressionStream === "undefined")
      throw Error(
        "モデルの展開に対応していないブラウザです。最新版のSafariまたはChromeをご利用ください。",
      );
    let buffer = await new Response(
      compressed.stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
    if (buffer.byteLength !== layer.bytes)
      throw Error("モデルデータの長さが一致しません。再読み込みしてください。");
    const geometries = [];
    for (const part of this.atlas.parts) {
      if (part.layer !== id) continue;
      const g = new T.BufferGeometry();
      g.setAttribute(
        "position",
        new T.BufferAttribute(
          new Float32Array(buffer, part.positions, part.vertexCount * 3),
          3,
        ),
      );
      g.setAttribute(
        "normal",
        new T.BufferAttribute(
          new Int16Array(buffer, part.normals, part.vertexCount * 3),
          3,
          true,
        ),
      );
      g.setIndex(
        new T.BufferAttribute(
          new Uint32Array(buffer, part.indices, part.indexCount),
          1,
        ),
      );
      g.setAttribute(
        "partIndex",
        new T.BufferAttribute(
          new Float32Array(part.vertexCount).fill(this.partIndex.get(part.id)),
          1,
        ),
      );
      const col = new T.Color(part.color || COLORS[part.system] || "#bdaf9c");
      if (id === "muscular")
        col.multiplyScalar(0.94 + (this.partIndex.get(part.id) % 7) * 0.018);
      const color = new Float32Array(part.vertexCount * 3);
      for (let i = 0; i < part.vertexCount; i++) {
        color[i * 3] = col.r;
        color[i * 3 + 1] = col.g;
        color[i * 3 + 2] = col.b;
      }
      g.setAttribute("color", new T.BufferAttribute(color, 3));
      geometries.push(g);
    }
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry) throw Error("3Dデータを構成できませんでした");
    geometry.computeBoundingSphere();
    const mat = new T.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.04,
      roughness: id === "skeletal" ? 0.54 : 0.43,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    mat.forceSinglePass = true;
    mat.clippingPlanes = this.clipping ? [this.clipPlane] : [];
    const uniforms = {
      selectionState: { value: this.selectionTexture },
      stateWidth: { value: this.textureWidth },
      isolation: { value: this.isolated ? 1 : 0 },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        "attribute float partIndex; uniform sampler2D selectionState; uniform float stateWidth; varying float selectedPart; varying float hiddenPart;\n" +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nselectedPart=texture2D(selectionState,vec2((partIndex+.5)/stateWidth,.5)).r; hiddenPart=texture2D(selectionState,vec2((partIndex+.5)/stateWidth,.5)).g;",
      );
      shader.fragmentShader =
        "varying float selectedPart; varying float hiddenPart; uniform float isolation;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(hiddenPart>.5 || (isolation>.5 && selectedPart<.5))discard;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.40,.88,.65),selectedPart*.7);",
      );
    };
    const mesh = new T.Mesh(geometry, mat);
    mesh.userData = { layer: id, uniforms };
    this.scene.add(mesh);
    this.layers.set(id, mesh);
    this.onProgress(id, 100);
    this.onReady(id);
    this.invalidate();
  }
  async setEnabled(ids) {
    this.enabled = new Set(ids);
    this.invalidate();
    await Promise.all(ids.map((id) => this.loadLayer(id)));
    this.invalidate();
  }
  setSelection(ids) {
    this.selected = new Set(ids);
    this.selectionLayer = this.atlas.parts[this.partIndex.get(ids[0])]?.layer;
    const box = new T.Box3();
    for (const id of ids) {
      const p = this.atlas.parts[this.partIndex.get(id)];
      if (p)
        box.union(
          new T.Box3(
            new T.Vector3(...p.bounds[0]),
            new T.Vector3(...p.bounds[1]),
          ),
        );
    }
    this.selectionCenter = box.isEmpty()
      ? null
      : box.getCenter(new T.Vector3());
    this.selectionBytes.fill(0);
    for (const id of ids) {
      const i = this.partIndex.get(id);
      if (i !== undefined) this.selectionBytes[i * 4] = 255;
    }
    for (const id of this.hiddenParts) {
      const i = this.partIndex.get(id);
      if (i !== undefined) this.selectionBytes[i * 4 + 1] = 255;
    }
    this.selectionTexture.needsUpdate = true;
    this.invalidate();
  }
  setIsolation(enabled) {
    this.isolated = enabled;
    for (const mesh of this.layers.values())
      mesh.userData.uniforms.isolation.value = enabled ? 1 : 0;
    this.invalidate();
  }
  setOpacity(value) {
    this.masterOpacity = value;
    this.invalidate();
  }
  setClip(enabled, axis, value) {
    const changed = this.clipping !== enabled;
    this.clipping = enabled;
    const normal =
      axis === "x"
        ? new T.Vector3(1, 0, 0)
        : axis === "y"
          ? new T.Vector3(0, 1, 0)
          : new T.Vector3(0, 0, 1);
    const position =
      axis === "y"
        ? 0.85 + value * 0.009
        : axis === "x"
          ? value * 0.006
          : value * 0.003;
    this.clipPlane.set(normal, -position);
    if (changed)
      for (const mesh of this.layers.values()) {
        mesh.material.clippingPlanes = enabled ? [this.clipPlane] : [];
        mesh.material.needsUpdate = true;
      }
    this.invalidate();
  }
  setSeparation(value) {
    this.separation = value;
    this.invalidate();
  }
  hideSelection() {
    for (const id of this.selected) this.hiddenParts.add(id);
    this.setSelection([]);
  }
  restoreHidden() {
    this.hiddenParts.clear();
    this.setSelection([...this.selected]);
  }
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    const source = this.renderer.domElement,
      canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#14282d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    const scale = canvas.width / this.host.clientWidth;
    ctx.fillStyle = "#14282d";
    ctx.fillRect(0, canvas.height - 42 * scale, canvas.width, 42 * scale);
    ctx.font = 10 * scale + "px sans-serif";
    ctx.fillStyle = "#b6d5c7";
    ctx.fillText(
      "BodyParts3D © DBCLS · CC BY 4.0",
      16 * scale,
      canvas.height - 17 * scale,
    );
    return canvas.toDataURL("image/png");
  }
  focus(ids) {
    const box = new T.Box3();
    for (const id of ids) {
      const p = this.atlas.parts[this.partIndex.get(id)];
      if (p)
        box.union(
          new T.Box3(
            new T.Vector3(...p.bounds[0]),
            new T.Vector3(...p.bounds[1]),
          ).translate(this.layers.get(p.layer)?.position || new T.Vector3()),
        );
    }
    if (box.isEmpty()) return;
    const target = box.getCenter(new T.Vector3()),
      size = box.getSize(new T.Vector3()),
      distance = Math.max(
        0.32,
        ((size.length() / Math.tan(T.MathUtils.degToRad(16))) * 0.75) /
          Math.min(1, this.camera.aspect),
      );
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    this.animateCamera(
      target.clone().addScaledVector(direction, Math.min(distance, 7)),
      target,
    );
  }
  pick(e) {
    const rect = this.host.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [...this.layers.values()].filter(
      (mesh) => this.enabled.has(mesh.userData.layer) && mesh.visible,
    );
    for (const hit of this.raycaster.intersectObjects(meshes, false)) {
      const i = Math.round(
          hit.object.geometry.attributes.partIndex.getX(hit.face.a),
        ),
        part = this.atlas.parts[i];
      if (this.hiddenParts.has(part.id)) continue;
      if (this.clipping && this.clipPlane.distanceToPoint(hit.point) < 0)
        continue;
      if (this.isolated && !this.selected.has(part.id)) continue;
      this.onSelect(part.id);
      return;
    }
  }
}
