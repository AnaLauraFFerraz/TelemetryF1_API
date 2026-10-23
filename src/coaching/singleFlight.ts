// Chamadas concorrentes com a mesma chave compartilham uma só execução (e o
// mesmo erro, se ela falhar); a entrada some quando termina, então nada fica
// guardado entre execuções.
export function createSingleFlight<T>(): { run(key: string, fn: () => Promise<T>): Promise<T> } {
  const inFlight = new Map<string, Promise<T>>();

  return {
    run(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing;

      const promise = fn().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
  };
}
