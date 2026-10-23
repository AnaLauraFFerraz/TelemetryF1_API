import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_SYSTEM_PROMPT } from "./coachPrompt";
import { buildCoachUserMessage } from "./coachUserMessage";
import { PHRASE_TEMPLATES } from "./coachReading";
import { PROMPT_VERSION, REFERENCE_INPUTS, computePromptVersion } from "./promptVersion";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function templatePattern(template: string): RegExp {
  return new RegExp(template.split("{m}").map(escapeRegExp).join("[^\\n]+?"));
}

const referenceMessages = REFERENCE_INPUTS.map((r) => buildCoachUserMessage(r.insights, r.primary, r.comparison));

test("a versão tem 16 caracteres hexadecimais minúsculos", () => {
  assert.match(computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage), /^[0-9a-f]{16}$/);
  assert.match(PROMPT_VERSION, /^[0-9a-f]{16}$/);
});

test("as mesmas entradas dão o mesmo valor", () => {
  assert.equal(
    computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage),
    computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage)
  );
  assert.equal(PROMPT_VERSION, computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage));
});

test("um caractere a mais no prompt muda a versão", () => {
  assert.notEqual(
    computePromptVersion(COACH_SYSTEM_PROMPT + "x", buildCoachUserMessage),
    computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage)
  );
});

test("um builder que muda uma frase muda a versão", () => {
  const changed: typeof buildCoachUserMessage = (insights, primary, comparison) =>
    buildCoachUserMessage(insights, primary, comparison).replace("Trail braking", "Trail-braking");
  assert.notEqual(
    computePromptVersion(COACH_SYSTEM_PROMPT, changed),
    computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage)
  );
});

test("CRLF e \\r solto no prompt dão o mesmo valor que LF", () => {
  const base = computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage);
  assert.equal(computePromptVersion(COACH_SYSTEM_PROMPT.replace(/\n/g, "\r\n"), buildCoachUserMessage), base);
  assert.equal(computePromptVersion(COACH_SYSTEM_PROMPT.replace(/\n/g, "\r"), buildCoachUserMessage), base);
});

test("CRLF nas mensagens do builder dá o mesmo valor que LF", () => {
  const crlf: typeof buildCoachUserMessage = (insights, primary, comparison) =>
    buildCoachUserMessage(insights, primary, comparison).replace(/\n/g, "\r\n");
  assert.equal(
    computePromptVersion(COACH_SYSTEM_PROMPT, crlf),
    computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage)
  );
});

test("cada modelo de frase do código aparece em alguma mensagem de referência", () => {
  for (const [name, template] of Object.entries(PHRASE_TEMPLATES)) {
    const pattern = templatePattern(template);
    assert.ok(
      referenceMessages.some((message) => pattern.test(message)),
      `nenhuma mensagem de referência cobre o modelo ${name}: ${template}`
    );
  }
});

test("a curva com deltaLossS <= 0 fica fora das mensagens de referência", () => {
  for (const message of referenceMessages) {
    assert.ok(!message.includes("9999m"));
  }
});

test("o módulo não carrega config/env nem persistence/db", () => {
  const loaded = Object.keys(require.cache).map((file) => file.replace(/\\/g, "/"));
  assert.ok(!loaded.some((file) => /\/src\/config\/env\.(ts|js)$/.test(file)));
  assert.ok(!loaded.some((file) => /\/src\/persistence\/db\.(ts|js)$/.test(file)));
});
