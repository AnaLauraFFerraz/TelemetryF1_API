import fs from "node:fs";

// Mesmo padrão e mesma exclusão que o `node --test` usa no script "test":
// um glob sem resultado passa em silêncio (exit 0), então a descoberta vazia
// precisa ser barrada aqui.
const PATTERN = "src/**/*.test.ts";

const files = fs.globSync(PATTERN, { exclude: (name) => name === "node_modules" });

if (files.length === 0) {
  console.error(`[assertTestFiles] nenhum arquivo de teste encontrado em ${PATTERN}`);
  process.exit(1);
}

console.log(`[assertTestFiles] ${files.length} arquivos de teste encontrados em ${PATTERN}`);
