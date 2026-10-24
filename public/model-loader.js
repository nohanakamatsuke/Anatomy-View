import { loadGeometryData } from "./model-storage.js";
export class ModelLoader {
  constructor() {
    this.pending = new Map();
    this.nextJob = 0;
    this.worker = null;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    const fail = () => {
      clearTimeout(this.startTimer);
      this.worker?.terminate();
      this.worker = null;
      this.resolveReady(false);
      for (const task of this.pending.values()) {
        const error = Error("モデル処理を切り替えます");
        error.workerUnavailable = true;
        task.reject(error);
      }
      this.pending.clear();
    };
    try {
      this.worker = new Worker(new URL("./model-worker.js", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          clearTimeout(this.startTimer);
          this.resolveReady(true);
          return;
        }
        const task = this.pending.get(data.job);
        if (!task) return;
        if (data.progress !== undefined) {
          task.onProgress(data.progress, data.phase);
          return;
        }
        this.pending.delete(data.job);
        if (data.error) task.reject(Error(data.error));
        else task.resolve(data.result);
      };
      this.worker.onerror = fail;
      // Some browsers can leave a module worker starting across a SW update.
      // Never leave the viewer waiting at 0% indefinitely in that case.
      this.startTimer = setTimeout(fail, 2000);
    } catch {
      fail();
    }
  }
  async load(payload, onProgress) {
    if (!(await this.ready) || !this.worker)
      return loadGeometryData(payload, onProgress);
    try {
      return await new Promise((resolve, reject) => {
        const job = ++this.nextJob;
        this.pending.set(job, { resolve, reject, onProgress });
        this.worker.postMessage({ job, payload });
      });
    } catch (error) {
      if (error.workerUnavailable) return loadGeometryData(payload, onProgress);
      throw error;
    }
  }
}
