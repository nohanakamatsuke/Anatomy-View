import * as T from "three";
import { pointCameraDistance } from "./acupoint-data.js";
export class AcupunctureOverlay {
  constructor(viewer, catalog, onSelect, onProject) {
    this.viewer = viewer;
    this.catalog = catalog;
    this.onSelect = onSelect;
    this.onProject = onProject;
    this.meridian = "LI";
    this.side = "both";
    this.selected = null;
    this.entries = catalog.points.flatMap((p) =>
      p.instances.map((instance) => ({
        ...instance,
        point: p,
        world: new T.Vector3(...instance.position).addScaledVector(
          new T.Vector3(...instance.normal),
          0.0035,
        ),
      })),
    );
    this.colors = new Map(
      catalog.meridians.map((m) => [m.code, new T.Color(m.color)]),
    );
    this.group = new T.Group();
    this.mesh = new T.InstancedMesh(
      new T.SphereGeometry(1, 8, 6),
      new T.MeshBasicMaterial({ color: 0xffffff }),
      this.entries.length,
    );
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.ring = new T.Mesh(
      new T.TorusGeometry(0.011, 0.0015, 8, 32),
      new T.MeshBasicMaterial({ color: 0xffe6ad }),
    );
    this.ring.visible = false;
    this.group.add(this.ring);
    this.group.visible = false;
    viewer.scene.add(this.group);
    this.matrix = new T.Matrix4();
    this.rotation = new T.Quaternion();
    this.ray = new T.Raycaster();
    this.viewDirection = new T.Vector3();
    this.projected = new T.Vector3();
    this.frame = () => this.project();
    this.refresh();
  }
  show() {
    this.group.visible = true;
    this.viewer.frameListeners.add(this.frame);
    this.previousPick = this.viewer.pickInterceptor;
    this.viewer.pickInterceptor = (e) => {
      this.pick(e);
      return true;
    };
    this.viewer.invalidate();
  }
  hide() {
    this.group.visible = false;
    this.viewer.frameListeners.delete(this.frame);
    this.viewer.pickInterceptor = this.previousPick;
    this.onProject(null);
    this.viewer.invalidate();
  }
  setFilter(meridian, side) {
    this.meridian = meridian;
    this.side = side;
    this.refresh();
  }
  visible(entry) {
    return (
      (this.meridian === "all" || entry.point.meridian === this.meridian) &&
      (this.side === "both" ||
        entry.side === "midline" ||
        entry.side === this.side)
    );
  }
  refresh() {
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i],
        active = this.visible(e),
        selected = this.selected === e;
      const size = active ? (selected ? 0.006 : 0.0035) : 0;
      this.matrix.compose(
        e.world,
        this.rotation,
        new T.Vector3(size, size, size),
      );
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(
        i,
        selected ? new T.Color("#fff5d7") : this.colors.get(e.point.meridian),
      );
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.ring.visible = !!this.selected && this.visible(this.selected);
    if (this.selected) {
      this.ring.position.copy(this.selected.world);
      this.ring.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        new T.Vector3(...this.selected.normal),
      );
    }
    this.viewer.invalidate();
  }
  select(point, side = "left", focus = true) {
    this.selected =
      this.entries.find(
        (e) => e.point.code === point.code && e.side === side,
      ) ||
      this.entries.find((e) => e.point.code === point.code) ||
      null;
    this.refresh();
    if (focus) {
      if (this.selected) {
        const normal = new T.Vector3(...this.selected.normal);
        if (Math.abs(normal.y) > 0.8) normal.z += 0.4;
        normal.normalize();
        const distance = pointCameraDistance(point),
          target = this.selected.world.clone();
        this.viewer.animateCamera(
          target.clone().addScaledVector(normal, distance),
          target,
        );
      } else {
        const target = new T.Vector3(0, 1.54, 0.09);
        this.viewer.animateCamera(
          target.clone().add(new T.Vector3(0, 0.02, 0.55)),
          target,
        );
      }
    }
  }
  project() {
    if (!this.group.visible || !this.selected || !this.visible(this.selected)) {
      this.onProject(null);
      return;
    }
    const e = this.selected,
      p = this.projected.copy(e.world).project(this.viewer.camera),
      facing = new T.Vector3(...e.normal).dot(
        this.viewDirection
          .copy(this.viewer.camera.position)
          .sub(e.world)
          .normalize(),
      );
    if (
      p.z < -1 ||
      p.z > 1 ||
      Math.abs(p.x) > 1 ||
      Math.abs(p.y) > 1 ||
      facing < -0.1
    ) {
      this.onProject(null);
      return;
    }
    this.onProject({
      x: ((p.x + 1) * this.viewer.host.clientWidth) / 2,
      y: ((1 - p.y) * this.viewer.host.clientHeight) / 2,
      point: e.point,
      side: e.side,
    });
  }
  pick(event) {
    const rect = this.viewer.host.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top,
      radius = event.pointerType === "touch" ? 20 : 14,
      candidates = [];
    for (const e of this.entries) {
      if (!this.visible(e)) continue;
      const facing = new T.Vector3(...e.normal).dot(
        this.viewDirection
          .copy(this.viewer.camera.position)
          .sub(e.world)
          .normalize(),
      );
      if (facing < 0) continue;
      const p = this.projected.copy(e.world).project(this.viewer.camera);
      if (p.z < -1 || p.z > 1) continue;
      const distance = Math.hypot(
        ((p.x + 1) * rect.width) / 2 - x,
        ((1 - p.y) * rect.height) / 2 - y,
      );
      if (distance < radius) candidates.push({ entry: e, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const skin = this.viewer.layers.get("integumentary");
    for (const { entry } of candidates.slice(0, 4)) {
      if (skin) {
        const direction = entry.world
            .clone()
            .sub(this.viewer.camera.position)
            .normalize(),
          distance = this.viewer.camera.position.distanceTo(entry.world);
        this.ray.set(this.viewer.camera.position, direction);
        this.ray.far = distance - 0.004;
        const blocked = this.ray.intersectObject(skin, false).some((hit) => {
          const index = skin.geometry.attributes.partIndex.getX(hit.face.a);
          return !this.viewer.hiddenParts.has(
            this.viewer.atlas.parts[index].id,
          );
        });
        if (blocked) continue;
      }
      this.onSelect(entry.point, entry.side);
      return;
    }
  }
}
