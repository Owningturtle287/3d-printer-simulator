import { coolingTargets } from './spec.js';

export function createAudio(printer) {
  let context, movement, moveGain, fan, fanGain, volume, enabled = false;
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Audio) return { enable: async () => false, update() {} };
  function blip(note, seconds = 0.13) {
    if (!enabled || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = note; oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
    oscillator.connect(gain).connect(volume); oscillator.start(); oscillator.stop(context.currentTime + seconds + 0.01);
  }
  printer.subscribe(event => {
    if (event === 'mechanism') blip(230);
    if (event === 'fault') blip(437, 0.4);
    if (event === 'complete') { blip(523); setTimeout(() => blip(659), 150); setTimeout(() => blip(784), 300); }
    if (event === 'ready') blip(620);
  });
  return {
    async enable(value) {
      if (value && !context) {
        context = new Audio();
        volume = context.createGain(); volume.gain.value = 0;
        volume.connect(context.destination);
        movement = context.createOscillator(); movement.type = 'triangle';
        moveGain = context.createGain(); moveGain.gain.value = 0;
        movement.connect(moveGain).connect(volume); movement.start();
        const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        fan = context.createBufferSource(); fan.buffer = noise; fan.loop = true;
        const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700;
        fanGain = context.createGain(); fanGain.gain.value = 0;
        fan.connect(filter).connect(fanGain).connect(volume); fan.start();
      }
      if (value) await context.resume();
      enabled = value;
      if (context) volume.gain.setTargetAtTime(value ? 0.34 : 0, context.currentTime, 0.04);
      return enabled;
    },
    update() {
      if (!enabled || !context || context.state !== 'running') return;
      const s = printer.state, motor = s.feed ? 125 : s.motionSpeed;
      const now = context.currentTime;
      movement.frequency.setTargetAtTime(53 + Math.min(750, motor * 2.6), now, 0.05);
      moveGain.gain.setTargetAtTime(s.power ? Math.min(0.095, motor * 0.0015) : 0, now, 0.05);
      const cooling = coolingTargets(s);
      const air = cooling.part / 7100 + cooling.auxiliary / 7800 + cooling.exhaust / 7650 +
        (cooling.left + cooling.right) / 26550 + cooling.heater / 14500;
      fanGain.gain.setTargetAtTime(Math.min(.145, air * .095), now, .14);
    },
  };
}
