import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const output = join(root, "dist");
const files = [
  "index.html", "privacy.html", "styles.css", "app.js", "core.js", "db.js",
  "config.js", "questions.json", "manifest.webmanifest", "sw.js", "_headers", "_redirects",
  "icons/apple-touch-icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "push/onesignal/OneSignalSDKWorker.js"
];

await rm(output, { recursive: true, force: true });
for (const relative of files) {
  const destination = join(output, relative);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, relative), destination);
}

const config = JSON.parse(process.env.KENKYO_PUBLIC_CONFIG || "{}");
if (config.apiBase || config.oneSignalAppId) {
  const safe = {
    apiBase: typeof config.apiBase === "string" ? config.apiBase : "",
    oneSignalAppId: typeof config.oneSignalAppId === "string" ? config.oneSignalAppId : "",
    oneSignalSafariWebId: typeof config.oneSignalSafariWebId === "string" ? config.oneSignalSafariWebId : ""
  };
  await writeFile(join(output, "config.js"), `window.KENKYO_CONFIG = Object.freeze(${JSON.stringify(safe, null, 2)});\n`);
}

const manifest = JSON.parse(await readFile(join(output, "manifest.webmanifest"), "utf8"));
if (manifest.icons?.length !== 2) throw new Error("PWA icons are incomplete");
console.log(`Built ${files.length} public files in dist/`);
