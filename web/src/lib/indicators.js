export function rsi(values, length = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= length) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }

  let avgGain = gainSum / length;
  let avgLoss = lossSum / length;
  out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = length + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export function sma(values, length) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  const window = [];

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      window.length = 0;
      sum = 0;
      count = 0;
      continue;
    }
    window.push(v);
    sum += v;
    count++;
    if (count > length) {
      sum -= window.shift();
      count--;
    }
    if (count === length) out[i] = sum / length;
  }

  return out;
}

// Chande Momentum Oscillator: 100 * (sumUp - sumDown) / (sumUp + sumDown)
export function chandeMO(values, length = 4) {
  const out = new Array(values.length).fill(null);

  for (let i = length; i < values.length; i++) {
    let sumUp = 0;
    let sumDown = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const change = values[j] - values[j - 1];
      if (change > 0) sumUp += change;
      else sumDown -= change;
    }
    const total = sumUp + sumDown;
    out[i] = total === 0 ? 0 : (100 * (sumUp - sumDown)) / total;
  }

  return out;
}
