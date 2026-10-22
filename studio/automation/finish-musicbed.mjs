// Original procedural composition, with no sampled or downloaded recordings.
export function createMusicBed(duration, sampleRate = 48000) {
  const samples = Math.round(duration * sampleRate), stereo = [new Float32Array(samples), new Float32Array(samples)];
  const notes = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 69]];
  const hz = (note) => 440 * 2 ** ((note - 69) / 12), tau = Math.PI * 2;
  const frequencies = notes.map((chord) => chord.map(hz));
  let seed = 0x4d4f5449, previous = 0, peak = 0;
  const pad = (chord, t, side) => chord.reduce((sum, f, i) => sum + Math.sin(tau * f * (1 + side * 0.0017) * t + i * 0.4) * 0.017, 0);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate, chord = Math.floor(t / 4) % 4, blend = Math.min(1, t % 4 / 0.45), beat = t % 0.5, eighth = t % 0.25, beatIndex = Math.floor(t / 0.5);
    const envelope = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (duration - t) / 1.2));
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 0xffffffff * 2 - 1, high = noise - previous; previous = noise;
    const kick = Math.sin(tau * (48 * beat + 2.5 * (1 - Math.exp(-beat * 32)))) * Math.exp(-beat * 19) * 0.055;
    const snare = beatIndex % 4 === 1 || beatIndex % 4 === 3 ? noise * Math.exp(-beat * 34) * 0.012 : 0;
    const hat = high * Math.exp(-eighth * 100) * 0.002;
    const bass = Math.sin(tau * hz(notes[chord][0] - 12) * t) * 0.028 * (1 - Math.exp(-beat * 70)) * Math.exp(-beat * 3.8);
    const bellFrequency = hz(notes[chord][[0, 2, 1, 3, 2, 1, 3, 2][beatIndex % 8]] + 12);
    const bell = Math.sin(tau * bellFrequency * beat) * Math.exp(-beat * 7) * Math.min(1, beat / 0.005) * 0.013;
    for (let side = 0; side < 2; side++) {
      const value = (pad(frequencies[chord], t, side) * blend + pad(frequencies[(chord + 3) % 4], t, side) * (1 - blend) + bass + kick + snare + hat + bell * (side ? 0.85 : 1)) * envelope;
      stereo[side][i] = value; peak = Math.max(peak, Math.abs(value));
    }
  }
  const buffer = Buffer.alloc(44 + samples * 4);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 4, 40);
  const gain = 0.5 / (peak || 1);
  for (let i = 0; i < samples; i++) for (let side = 0; side < 2; side++) buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, stereo[side][i] * gain)) * 32767), 44 + i * 4 + side * 2);
  return buffer;
}
