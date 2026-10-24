import { loadGeometryData } from "./model-storage.js";
export class ModelLoader {
  constructor() {
    this.pending = new Map();
    this.nextJob = 0;
    try {
      this.worker = new Worker(new URL("./model-worker.js", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = ({ data }) => {
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
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        for (const task of this.pending.values()) {
          const error = Error("モデル処理を切り替えます");
          error.workerUnavailable = true;
          task.reject(error);
        }
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }
  async load(payload, onProgress) {
    if (!this.worker) return loadGeometryData(payload, onProgress);
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
