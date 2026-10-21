import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findProjectRoot } from "./projectRoot";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "telemetryf1-root-"));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test("a partir do próprio módulo, encontra a raiz deste repositório", () => {
  const root = findProjectRoot(__dirname);
  const pkgPath = path.join(root, "package.json");
  assert.ok(fs.existsSync(pkgPath), `sem package.json em ${root}`);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name: string };
  assert.equal(pkg.name, "telemetryf1-server");
});

test("a partir de uma pasta aninhada, sobe até o package.json mais próximo", () => {
  const base = makeTempDir();
  fs.writeFileSync(path.join(base, "package.json"), "{}");
  const nested = path.join(base, "a", "b");
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(findProjectRoot(nested), base);
});

test("sem package.json até a raiz do disco, falha com mensagem clara", () => {
  const base = makeTempDir();
  const nested = path.join(base, "x");
  fs.mkdirSync(nested);

  // os.tmpdir() pode estar dentro de uma pasta com package.json numa máquina
  // qualquer; o teste só vale se nenhum ancestral tiver um.
  let dir = nested;
  while (true) {
    assert.ok(!fs.existsSync(path.join(dir, "package.json")), `ancestral com package.json: ${dir}`);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  assert.throws(() => findProjectRoot(nested), {
    message: `[projectRoot] package.json não encontrado acima de ${nested}`,
  });
});
