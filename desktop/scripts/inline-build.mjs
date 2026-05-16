import { promises as fs } from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const htmlPath = path.join(distDir, "index.html");

async function readUtf8(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function inlineBuild() {
  let html = await readUtf8(htmlPath);

  const stylesheetMatches = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
  for (const match of stylesheetMatches) {
    const href = match[1];
    const cssPath = path.join(distDir, href);
    const css = await readUtf8(cssPath);
    html = html.replace(match[0], () => `<style>\n${css}\n</style>`);
  }

  const scriptMatches = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)];
  for (const match of scriptMatches) {
    const src = match[1];
    const jsPath = path.join(distDir, src);
    const js = await readUtf8(jsPath);
    html = html.replace(match[0], () => `<script type="module">\n${js}\n</script>`);
  }

  await fs.writeFile(htmlPath, html);
  await removeIfExists(path.join(distDir, "assets"));
  await removeIfExists(path.join(distDir, "vite.svg"));
  await removeIfExists(path.join(distDir, "tauri.svg"));
}

inlineBuild().catch((error) => {
  console.error("Failed to inline desktop build:", error);
  process.exitCode = 1;
});
