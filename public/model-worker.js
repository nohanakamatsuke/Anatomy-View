import { loadGeometryData } from "./model-storage.js";
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue
    .then(async () => {
      try {
        const result = await loadGeometryData(data.payload, (value, phase) =>
          self.postMessage({ job: data.job, progress: value, phase }),
        );
        self.postMessage({ job: data.job, result }, [result.buffer]);
      } catch (error) {
        self.postMessage({
          job: data.job,
          error: error.message || String(error),
        });
      }
    })
    .catch(() => {});
};
