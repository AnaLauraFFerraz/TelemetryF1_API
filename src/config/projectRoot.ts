import fs from "node:fs";
import path from "node:path";

// Compilado, este arquivo fica em dist/src/config/ - um caminho fixo como
// __dirname/../.. apontaria para dist/, não para a raiz do repositório.
// Subir até o package.json dá a mesma raiz a partir do fonte e do build.
export function findProjectRoot(startDir: string = __dirname): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`[projectRoot] package.json não encontrado acima de ${startDir}`);
    }
    dir = parent;
  }
}
