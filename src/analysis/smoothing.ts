/**
 * Média móvel centrada sobre uma série [x, y] ordenada por x. Usada para
 * tirar ruído de amostra-a-amostra antes de procurar mínimos/máximos locais
 * (ex: velocidade), sem deslocar a posição no eixo x dos pontos.
 */
export function movingAverage(points: [number, number][], windowSize: number): [number, number][] {
  if (points.length === 0 || windowSize <= 1) return points;

  const halfWindow = Math.floor(windowSize / 2);

  return points.map((point, i) => {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(points.length - 1, i + halfWindow);

    let sum = 0;
    for (let j = start; j <= end; j++) {
      sum += points[j][1];
    }

    return [point[0], sum / (end - start + 1)] as [number, number];
  });
}
