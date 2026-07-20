#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const duration = Number(args.duration);
const output = resolve(args.output ?? "lotion-video-score.wav");
if (!Number.isFinite(duration) || duration <= 0) throw new Error("--duration must be a positive number");

const sampleRate = 48_000;
const frameCount = Math.ceil(duration * sampleRate);
const left = new Float32Array(frameCount);
const right = new Float32Array(frameCount);
const bpm = 92;
const beatSeconds = 60 / bpm;
const barSeconds = beatSeconds * 4;
const progression = [
  { bass: 36, chord: [60, 64, 67, 71] },
  { bass: 33, chord: [57, 60, 64, 67] },
  { bass: 29, chord: [53, 57, 60, 64] },
  { bass: 31, chord: [55, 59, 62, 64] }
];
const arpPattern = [0, 2, 1, 3, 2, 1, 3, 2];
const melodyPattern = [72, 74, 76, 79, 76, 74, 72, 69, 72, 74, 79, 81, 79, 76, 74, 72];

for (let bar = 0; bar * barSeconds < duration; bar += 1) {
  const start = bar * barSeconds;
  const harmony = progression[bar % progression.length];
  const section = Math.floor(bar / 8) % 3;
  const sectionGain = section === 0 ? 0.88 : section === 1 ? 1 : 0.93;

  for (const midi of harmony.chord) {
    addTone({
      start,
      duration: Math.min(barSeconds + 0.18, duration - start),
      frequency: noteFrequency(midi),
      amplitude: 0.018 * sectionGain,
      pan: (midi - 65) / 25,
      envelope: "pad",
      harmonics: [1, 0.22, 0.07]
    });
  }

  for (let step = 0; step < 8; step += 1) {
    const note = harmony.chord[arpPattern[step]] + 12;
    addTone({
      start: start + step * beatSeconds / 2,
      duration: beatSeconds * 0.72,
      frequency: noteFrequency(note),
      amplitude: 0.035 * sectionGain,
      pan: step % 2 === 0 ? -0.28 : 0.28,
      envelope: "pluck",
      harmonics: [1, 0.32, 0.09]
    });
  }

  for (const beat of [0, 2]) {
    const at = start + beat * beatSeconds;
    addTone({
      start: at,
      duration: beatSeconds * 0.84,
      frequency: noteFrequency(harmony.bass),
      amplitude: 0.055 * sectionGain,
      pan: 0,
      envelope: "bass",
      harmonics: [1, 0.18]
    });
    addKick(at, 0.028 * sectionGain);
  }

  if (bar >= 2 && bar % 2 === 0) {
    const phrase = Math.floor(bar / 2) % 4;
    for (let noteIndex = 0; noteIndex < 2; noteIndex += 1) {
      const sequenceIndex = (phrase * 4 + noteIndex * 2) % melodyPattern.length;
      addTone({
        start: start + (1.25 + noteIndex * 1.5) * beatSeconds,
        duration: beatSeconds * 1.05,
        frequency: noteFrequency(melodyPattern[sequenceIndex]),
        amplitude: 0.027 * sectionGain,
        pan: noteIndex === 0 ? -0.18 : 0.18,
        envelope: "pluck",
        harmonics: [1, 0.2, 0.05]
      });
    }
  }
}

addStereoDelay(Math.round(sampleRate * 0.245), 0.105, true);
addStereoDelay(Math.round(sampleRate * 0.39), 0.065, false);
lowPass(left, 8_200);
lowPass(right, 8_200);
applyFadeAndNormalize();
await writeFile(output, encodeWav(left, right));
console.log(JSON.stringify({ output, duration, sampleRate, channels: 2 }, null, 2));

function addTone({ start, duration: noteDuration, frequency, amplitude, pan, envelope, harmonics }) {
  if (noteDuration <= 0 || start >= duration) return;
  const firstFrame = Math.max(0, Math.floor(start * sampleRate));
  const noteFrames = Math.min(Math.ceil(noteDuration * sampleRate), frameCount - firstFrame);
  const leftGain = Math.sqrt((1 - Math.max(-1, Math.min(1, pan))) / 2);
  const rightGain = Math.sqrt((1 + Math.max(-1, Math.min(1, pan))) / 2);
  for (let frame = 0; frame < noteFrames; frame += 1) {
    const local = frame / sampleRate;
    const progress = frame / Math.max(1, noteFrames - 1);
    const env = envelopeValue(envelope, local, progress, noteDuration);
    let wave = 0;
    for (let harmonic = 0; harmonic < harmonics.length; harmonic += 1) {
      wave += harmonics[harmonic] * Math.sin(2 * Math.PI * frequency * (harmonic + 1) * local);
    }
    const sample = wave * amplitude * env;
    left[firstFrame + frame] += sample * leftGain;
    right[firstFrame + frame] += sample * rightGain;
  }
}

function envelopeValue(type, local, progress, noteDuration) {
  if (type === "pad") {
    const attack = Math.min(1, local / 0.32);
    const release = Math.min(1, (noteDuration - local) / 0.48);
    return smoothStep(attack) * smoothStep(release) * (0.94 + 0.06 * Math.sin(2 * Math.PI * local / 3.8));
  }
  if (type === "bass") {
    const attack = Math.min(1, local / 0.018);
    return smoothStep(attack) * Math.exp(-2.5 * progress) * Math.min(1, (1 - progress) * 8);
  }
  const attack = Math.min(1, local / 0.009);
  return smoothStep(attack) * Math.exp(-4.6 * progress) * Math.min(1, (1 - progress) * 12);
}

function addKick(start, amplitude) {
  const kickDuration = 0.32;
  const firstFrame = Math.floor(start * sampleRate);
  const frames = Math.min(Math.ceil(kickDuration * sampleRate), frameCount - firstFrame);
  let phase = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const progress = frame / Math.max(1, frames - 1);
    const frequency = 72 * Math.pow(44 / 72, progress);
    phase += 2 * Math.PI * frequency / sampleRate;
    const sample = Math.sin(phase) * amplitude * Math.exp(-7 * progress);
    left[firstFrame + frame] += sample * 0.707;
    right[firstFrame + frame] += sample * 0.707;
  }
}

function addStereoDelay(delayFrames, gain, crossFeed) {
  for (let frame = delayFrames; frame < frameCount; frame += 1) {
    const delayedLeft = left[frame - delayFrames];
    const delayedRight = right[frame - delayFrames];
    left[frame] += (crossFeed ? delayedRight : delayedLeft) * gain;
    right[frame] += (crossFeed ? delayedLeft : delayedRight) * gain;
  }
}

function lowPass(channel, cutoff) {
  const coefficient = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
  let state = 0;
  for (let frame = 0; frame < channel.length; frame += 1) {
    state += coefficient * (channel[frame] - state);
    channel[frame] = state;
  }
}

function applyFadeAndNormalize() {
  let peak = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const seconds = frame / sampleRate;
    const fadeIn = Math.min(1, seconds / 1.5);
    const fadeOut = Math.min(1, (duration - seconds) / 3);
    const fade = smoothStep(Math.max(0, Math.min(fadeIn, fadeOut)));
    left[frame] *= fade;
    right[frame] *= fade;
    peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
  }
  const gain = peak > 0 ? 0.24 / peak : 1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    left[frame] = softClip(left[frame] * gain);
    right[frame] = softClip(right[frame] * gain);
  }
}

function encodeWav(leftChannel, rightChannel) {
  const bytesPerFrame = 4;
  const dataLength = frameCount * bytesPerFrame;
  const buffer = Buffer.allocUnsafe(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerFrame, 28);
  buffer.writeUInt16LE(bytesPerFrame, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    buffer.writeInt16LE(toPcm16(leftChannel[frame]), 44 + frame * bytesPerFrame);
    buffer.writeInt16LE(toPcm16(rightChannel[frame]), 46 + frame * bytesPerFrame);
  }
  return buffer;
}

function noteFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function smoothStep(value) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function softClip(value) {
  return Math.tanh(value * 1.08) / Math.tanh(1.08);
}

function toPcm16(value) {
  return Math.round(Math.max(-1, Math.min(1, value)) * 32_767);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) continue;
    parsed[key.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}
