# Contract: the coach's user message

Internal contract between `buildCoachUserMessage` and the system prompt (which describes this layout to the model). Not part of the REST contract. Spec 003's export sends exactly this message; its `--dry-run` prints it.

The six messages of the demo recording, built by the research prototype of this layout, are in [research.md](../research.md), section 4.

## Layout

Blocks separated by one empty line, in this order:

1. **Compared laps** (always):

   ```text
   Voltas comparadas (mesma sessão):
   - Volta principal (a que o piloto quer melhorar): volta <n>, <tempo>, <validade>.
   - Volta de comparação: volta <n>, <tempo>, <validade>.
   <diferença oficial>
   Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.
   ```

   - `<tempo>`: `tempo oficial m:ss.sss` or `tempo oficial desconhecido`.
   - `<validade>`: `válida`, `inválida` or `validade desconhecida`.
   - `<diferença oficial>`: `Diferença oficial: a volta principal foi X.XXX s mais lenta|mais rápida que a volta de comparação.`, `… as duas voltas tiveram o mesmo tempo.`, or, when a time is unknown, `Diferença oficial: desconhecida (falta o tempo oficial de uma das voltas). Não afirme diferença de tempo de volta.`

2. **Invalid-comparison warning** (only when the comparison lap's validity is `false`):

   ```text
   Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.
   ```

3. **Opportunities** (always): the header `Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):` followed by one block per opportunity — the label on its own line, then indented phrases for braking point, peak brake, trail braking, throttle pick-up and coasting ([data-model.md](../data-model.md), "Opportunity reading"). With no corner losing time: `Oportunidades: nenhuma curva teve perda de tempo contra a volta de comparação.`

4. **Data**: `Dados completos (JSON):` and, on the next line, `JSON.stringify(insights)` unchanged.

## Guarantees

- No benchmark of any kind (no personal best, no theoretical best, no word "setor").
- Labels identical to the frontend chips for the same insights.
- Every direction phrase consistent with the sign of its field; `null` omitted; zero read as equal.
- The only number not present in the insights or in the official lap times is the official difference.
- Deterministic: the same insights and laps give the same string, byte for byte.

The exact Portuguese wording may be refined during implementation; any change changes `PROMPT_VERSION` by construction.
