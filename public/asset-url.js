// App-shell files share a build version; model files have their own content hashes.
export function assetURL(path) {
  const url = new URL(path, import.meta.url),
    version = new URL(import.meta.url).searchParams.get("v");
  if (version) url.searchParams.set("v", version);
  return url;
}
