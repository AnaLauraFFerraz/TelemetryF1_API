// Cliente WebSocket que só conta mensagens, num processo separado, para que a CPU
// medida em measure-compression.ts seja só a do servidor.
// Uso: node specs/003-demo-mode/evidence/ws-sink.mjs <url> <mensagens esperadas>
import { WebSocket } from "ws";

const [url, expected] = process.argv.slice(2);
const client = new WebSocket(url);
let received = 0;
client.on("message", () => {
  received += 1;
  if (received === Number(expected)) {
    process.stdout.write("done\n");
    client.close();
  }
});
client.on("open", () => process.stdout.write("open\n"));
