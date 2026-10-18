import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import dgram from "node:dgram";
import path from "node:path";
import type { AddressInfo } from "node:net";

// T032: um diretório no lugar do arquivo deve sair com código 1, mensagem
// clara (não um stack trace do Node), e sem enviar nenhum pacote UDP.
// Sobe a CLI de verdade como processo filho, com UDP_PORT redirecionada
// pra uma porta efêmera que só este teste escuta - WS_PORT/HTTP_PORT são
// exigidas por env.ts mas nunca usadas por tools/replayer.ts, então
// qualquer porta válida serve.
test("CLI: diretório no lugar do arquivo sai com código 1, mensagem do [replayer], e não envia pacote nenhum", async () => {
  const listener = dgram.createSocket("udp4");
  let received = 0;
  listener.on("message", () => {
    received += 1;
  });
  await new Promise<void>((resolve) => listener.bind(0, resolve));
  const port = (listener.address() as AddressInfo).port;

  try {
    const replayerPath = path.resolve(__dirname, "..", "..", "tools", "replayer.ts");
    const dirAsFile = __dirname; // diretório real, existe, mas não é um arquivo

    const result = spawnSync(process.execPath, ["-r", "ts-node/register", replayerPath, dirAsFile], {
      encoding: "utf8",
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        UDP_PORT: String(port),
        WS_PORT: "12345",
        HTTP_PORT: "12346",
      },
    });

    assert.equal(result.status, 1, `esperava saída com código 1, saiu com ${result.status}; stderr: ${result.stderr}`);
    assert.match(result.stderr, /\[replayer\] não foi possível ler o arquivo/);
    assert.doesNotMatch(result.stderr, /at Object\.readFileSync|node:fs/, "não deveria vazar stack trace do Node");

    // dá um tempo pra um eventual pacote (se algum tivesse sido mandado) chegar
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(received, 0, "nenhum pacote deveria ter sido enviado antes da validação falhar");
  } finally {
    listener.close();
  }
});
