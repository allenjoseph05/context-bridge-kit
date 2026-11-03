import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// One project per package. A glob entry ("packages/*") cannot inherit the root config, so packages
// without their own vitest.config.ts are inline projects with `extends: true` (they get the root's
// "source" resolve condition); a package with its own config is loaded as-is.
const packages = readdirSync("packages").filter((d) => existsSync(join("packages", d, "package.json")));

export default packages.map((dir) => {
  const root = join("packages", dir);
  if (existsSync(join(root, "vitest.config.ts"))) return root;
  const { name } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string };
  return { extends: true as const, test: { name, root } };
});
