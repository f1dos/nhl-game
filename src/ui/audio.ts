/**
 * Procedural game audio built on the Web Audio API — no sound files.
 *
 * - Menu: a calm, slowly evolving ambient soundtrack (soft pads, a muted
 *   piano-like pluck and a sparse arpeggio, through a generated reverb).
 * - Arena: an NHL-style crowd bed that breathes with the play, plus
 *   reactions (shot "ooh", saves, hits, the goal roar and horn, the
 *   referee's whistle, organ stings and rhythmic claps during stoppages).
 *
 * Everything degrades to a silent no-op when Web Audio is unavailable
 * (tests, old browsers) and starts only after a user gesture.
 */

type Prefs = { music: boolean; sound: boolean; volume: number };
const PREFS_KEY = "nhlm27-audio";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { music: true, sound: true, volume: 0.8, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { music: true, sound: true, volume: 0.8 };
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Warm, lounge-style progression in D major (bass + four voices, MIDI).
const PROGRESSION = [
  [38, 57, 61, 64, 66], // Dmaj9
  [35, 54, 57, 61, 62], // Bm9
  [31, 54, 57, 59, 62], // Gmaj7/9
  [33, 52, 55, 59, 61], // A6sus
  [40, 55, 59, 62, 66], // Em9
  [42, 57, 61, 64, 66], // F#m7
  [31, 54, 59, 62, 64], // Gmaj6/9
  [33, 55, 57, 61, 64], // A7sus
];
// A slow melody that answers itself every two bars (D major pentatonic).
const MOTIFS = [
  [[0, 78], [1.5, 76], [2.5, 73]],
  [[0.5, 71], [2, 73]],
  [[0, 74], [1, 76], [2.5, 78]],
  [[1, 81], [2, 78]],
];

class GameAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private crowdBus?: GainNode;
  private reverb?: ConvolverNode;
  private noise?: AudioBuffer;
  prefs: Prefs = loadPrefs();
  private arenaCount = 0;
  private musicTimer?: number;
  private musicStep = 0;
  private nextBar = 0;
  private crowd?: { base: GainNode; band: BiquadFilterNode; swell: GainNode; sources: AudioScheduledSourceNode[] };
  private crowdTimer?: number;
  private running = false;
  private excitement = 0.35;
  private listeners = new Set<() => void>();
  private unlocked = false;

  /** Resume on the first click/tap (browsers block autoplay). */
  installUnlock() {
    if (typeof window === "undefined" || this.unlocked) return;
    const unlock = () => {
      this.unlocked = true;
      this.ensure();
      void this.ctx?.resume();
      this.refresh();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  setPrefs(next: Partial<Prefs>) {
    this.prefs = { ...this.prefs, ...next };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(this.prefs.sound ? this.prefs.volume : 0, this.ctx.currentTime, 0.2);
    this.refresh();
    this.listeners.forEach((fn) => fn());
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return undefined;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.prefs.sound ? this.prefs.volume : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0;
      this.crowdBus = ctx.createGain();
      this.crowdBus.gain.value = 0;
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.2, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.musicBus.connect(this.master);
      this.musicBus.connect(this.reverb);
      this.reverb.connect(wet).connect(this.master);
      this.crowdBus.connect(this.master);
      // Pink-ish noise shared by the crowd, claps and the arena.
      const length = ctx.sampleRate * 4;
      this.noise = ctx.createBuffer(2, length, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const data = this.noise.getChannelData(c);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + white * 0.099046;
          b1 = 0.963 * b1 + white * 0.2965164;
          b2 = 0.57 * b2 + white * 1.0526913;
          data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
        }
      }
      return ctx;
    } catch {
      return undefined;
    }
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buffer;
  }

  /** The arena view is open: crowd on, menu music off. */
  enterArena() {
    this.arenaCount++;
    this.refresh();
    return () => {
      this.arenaCount = Math.max(0, this.arenaCount - 1);
      this.refresh();
    };
  }

  /** Live play running (crowd louder) or paused (crowd settles). */
  setRunning(running: boolean) {
    this.running = running;
    this.applyCrowdLevel();
  }

  private refresh() {
    const ctx = this.unlocked ? this.ensure() : undefined;
    if (!ctx || !this.musicBus || !this.crowdBus) return;
    const inArena = this.arenaCount > 0;
    const musicOn = this.prefs.music && !inArena;
    this.musicBus.gain.setTargetAtTime(musicOn ? 0.5 : 0, ctx.currentTime, musicOn ? 1.5 : 0.4);
    if (musicOn && this.musicTimer === undefined) this.startMusic();
    if (!musicOn && this.musicTimer !== undefined) {
      // Already scheduled notes fade out with the bus gain.
      window.clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
    if (inArena) this.startCrowd();
    else this.stopCrowd();
  }

  // ---------------------------------------------------------------- music

  private startMusic() {
    const ctx = this.ctx!;
    this.nextBar = ctx.currentTime + 0.2;
    const barLength = (60 / 60) * 4; // 60 bpm, 4/4
    this.musicTimer = window.setInterval(() => {
      while (this.nextBar < ctx.currentTime + 1.2) {
        this.playBar(this.nextBar, barLength);
        this.nextBar += barLength;
        this.musicStep++;
      }
    }, 250);
  }

  private playBar(t: number, length: number) {
    const step = this.musicStep;
    const chord = PROGRESSION[step % PROGRESSION.length];
    const beat = length / 4;
    // Electric piano: the chord on 1, a softer, slightly late echo on the "and" of 2.
    chord.slice(1).forEach((note, i) => {
      this.epiano(midi(note), t + i * 0.018, 0.034, beat * 2.6);
      this.epiano(midi(note), t + beat * 1.5 + 0.03 + i * 0.012, 0.016, beat * 2);
    });
    // Round, quiet bass: root on 1, fifth on 3.
    this.bass(midi(chord[0]), t, beat * 1.8);
    this.bass(midi(chord[0] + 7), t + beat * 2, beat * 1.6, 0.6);
    // A faint warm pad underneath for depth.
    this.pad(midi(chord[2]), t, length, 0.012, 0, "sine");
    // Melody every other phrase so the room can breathe.
    if (Math.floor(step / 4) % 2 === 1)
      for (const [at, note] of MOTIFS[step % MOTIFS.length]) this.pluck(midi(note), t + at * beat, 0.024, 2.8);
  }

  /** Rhodes-like voice: sine body with a bell-ish attack and slow tremolo. */
  private epiano(freq: number, t: number, level: number, decay: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + 0.012);
    out.gain.exponentialRampToValueAtTime(level * 0.35, t + 0.5);
    out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    // Tremolo as its own stage, so it scales with the note and dies with it.
    const tremStage = ctx.createGain();
    tremStage.gain.value = 1;
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.2;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.16;
    trem.connect(tremDepth).connect(tremStage.gain);
    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.value = freq;
    // FM tine for the characteristic bell on the attack.
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * 14;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.9, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + 0.25);
    mod.connect(modGain).connect(body.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    body.connect(lp).connect(tremStage).connect(out).connect(this.musicBus!);
    for (const osc of [body, mod, trem]) {
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }

  private bass(freq: number, t: number, length: number, level = 1) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * level, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(lp).connect(g).connect(this.musicBus!);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }

  private pad(freq: number, t: number, length: number, level: number, detune = 0, type: OscillatorType = "triangle") {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + length * 0.35);
    gain.gain.linearRampToValueAtTime(level * 0.8, t + length * 0.75);
    gain.gain.linearRampToValueAtTime(0, t + length + 0.6);
    osc.connect(filter).connect(gain).connect(this.musicBus!);
    osc.start(t);
    osc.stop(t + length + 0.7);
  }

  private pluck(freq: number, t: number, level: number, decay = 1.8) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + decay);
    filter.connect(gain).connect(this.musicBus!);
    [1, 2, 3].forEach((h, i) => {
      const osc = ctx.createOscillator();
      osc.type = i ? "sine" : "triangle";
      osc.frequency.value = freq * h;
      const g = ctx.createGain();
      g.gain.value = [1, 0.35, 0.12][i];
      osc.connect(g).connect(filter);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    });
  }

  // ---------------------------------------------------------------- crowd

  private noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    src.loopStart = Math.random() * 3;
    return src;
  }

  private startCrowd() {
    const ctx = this.ctx!;
    if (this.crowd) return;
    const base = ctx.createGain();
    base.gain.value = 0;
    const swell = ctx.createGain();
    swell.gain.value = 1;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 700;
    band.Q.value = 0.6;
    const sources: AudioScheduledSourceNode[] = [];
    // Three layers: low rumble, voice band murmur and a bright chatter.
    ([
      [220, 0.7, 0.9],
      [700, 0.5, 1.0],
      [1700, 0.9, 0.35],
    ] as const).forEach(([freq, q, level], i) => {
      const src = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = level;
      // Slow "breathing" of the crowd on each layer.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.05;
      const depth = ctx.createGain();
      depth.gain.value = level * 0.25;
      lfo.connect(depth).connect(g.gain);
      src.connect(f).connect(g).connect(band);
      src.start();
      lfo.start();
      sources.push(src, lfo);
    });
    band.connect(swell).connect(base).connect(this.crowdBus!);
    this.crowd = { base, band, swell, sources };
    this.crowdBus!.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    this.applyCrowdLevel();
    // Claps and chants now and then during play.
    this.crowdTimer = window.setInterval(() => {
      if (!this.running || Math.random() > 0.18) return;
      Math.random() < 0.6 ? this.chantClaps() : this.organ("charge");
    }, 6000);
  }

  private stopCrowd() {
    if (!this.crowd || !this.ctx) return;
    const { sources, base } = this.crowd;
    base.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    window.clearInterval(this.crowdTimer);
    this.crowdTimer = undefined;
    const old = this.crowd;
    this.crowd = undefined;
    window.setTimeout(() => {
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      });
      old.base.disconnect();
    }, 1500);
  }

  private applyCrowdLevel() {
    if (!this.crowd || !this.ctx) return;
    const level = (this.running ? 0.55 : 0.32) + this.excitement * 0.25;
    this.crowd.base.gain.setTargetAtTime(level, this.ctx.currentTime, 0.9);
  }

  /** A short rise and fall of the crowd (e.g. "ooh" on a shot). */
  private swell(amount: number, attack: number, hold: number, release: number, brighten = 0) {
    if (!this.crowd || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.crowd.swell.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 + amount, t + attack);
    g.setValueAtTime(1 + amount, t + attack + hold);
    g.linearRampToValueAtTime(1, t + attack + hold + release);
    if (brighten) {
      const f = this.crowd.band.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(f.value, t);
      f.linearRampToValueAtTime(700 + brighten, t + attack);
      f.linearRampToValueAtTime(700, t + attack + hold + release);
    }
  }

  private whistle(length = 0.45) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 2900;
    const vib = ctx.createOscillator();
    vib.frequency.value = 38;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 110;
    vib.connect(vibDepth).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.02);
    gain.gain.setValueAtTime(0.09, t + length);
    gain.gain.linearRampToValueAtTime(0, t + length + 0.05);
    osc.connect(gain).connect(this.crowdBus!);
    osc.start(t);
    vib.start(t);
    osc.stop(t + length + 0.1);
    vib.stop(t + length + 0.1);
  }

  private thud(level = 0.5) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // Boards: a low body thump plus a short noisy rattle of the glass.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(this.crowdBus!);
    osc.start(t);
    osc.stop(t + 0.4);
    const src = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(level * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(hp).connect(ng).connect(this.crowdBus!);
    src.start(t);
    src.stop(t + 0.25);
  }

  private stick(level = 0.25) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(bp).connect(g).connect(this.crowdBus!);
    src.start(t);
    src.stop(t + 0.1);
  }

  private horn() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.08);
    g.gain.setValueAtTime(0.16, t + 3.2);
    g.gain.linearRampToValueAtTime(0, t + 3.8);
    filter.connect(g).connect(this.crowdBus!);
    [138, 174, 207, 276].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 3.9);
    });
  }

  private organ(kind: "charge" | "goal") {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.05;
    const notes = kind === "charge" ? [67, 72, 76, 79, 76, 79] : [72, 76, 79, 84, 79, 84, 88];
    const step = kind === "charge" ? 0.16 : 0.13;
    notes.forEach((n, i) => {
      const t = t0 + i * step + (kind === "charge" && i >= 4 ? 0.12 : 0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.setValueAtTime(0.05, t + step * 0.8);
      g.gain.linearRampToValueAtTime(0, t + step * (i === notes.length - 1 ? 3 : 0.95));
      g.connect(this.crowdBus!);
      [1, 2, 4].forEach((h, k) => {
        const osc = ctx.createOscillator();
        osc.type = k ? "sine" : "square";
        osc.frequency.value = midi(n) * h;
        const hg = ctx.createGain();
        hg.gain.value = [0.5, 0.4, 0.15][k];
        osc.connect(hg).connect(g);
        osc.start(t);
        osc.stop(t + step * 3.2);
      });
    });
    if (kind === "charge") window.setTimeout(() => this.swell(0.6, 0.15, 0.5, 1.2, 300), 1200);
  }

  private chantClaps() {
    const ctx = this.ctx!;
    // "Let's go (team)!" rhythm: clap clap — clap clap clap.
    const pattern = [0, 0.3, 0.9, 1.15, 1.4];
    for (let r = 0; r < 2; r++)
      pattern.forEach((p) => {
        const t = ctx.currentTime + r * 2 + p;
        const src = this.noiseSource();
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1300;
        bp.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        src.connect(bp).connect(g).connect(this.crowdBus!);
        src.start(t);
        src.stop(t + 0.2);
      });
  }

  /**
   * React to something on the ice. `homeSide` tells whether the home team
   * (the arena's own crowd) is the one acting.
   */
  react(kind: string, opts: { home?: boolean; danger?: number } = {}) {
    if (!this.ctx || !this.crowd || !this.prefs.sound) return;
    const home = opts.home ?? true;
    switch (kind) {
      case "shot":
        this.stick(0.3);
        if (home) this.swell(0.45 + (opts.danger ?? 0.3), 0.25, 0.25, 1.1, 350);
        break;
      case "save":
        this.swell(home ? 0.25 : 0.55, 0.15, 0.3, 1.3, 200);
        break;
      case "pass":
        this.stick(0.12);
        break;
      case "check":
      case "hit":
        this.thud(0.45);
        this.swell(0.35, 0.12, 0.2, 0.9, 250);
        break;
      case "block":
        this.thud(0.2);
        this.swell(0.2, 0.1, 0.2, 0.8);
        break;
      case "whistle":
        this.whistle();
        break;
      case "penalty":
        this.whistle(0.6);
        this.swell(home ? -0.25 : 0.4, 0.3, 0.8, 1.6, home ? -150 : 200);
        break;
      case "faceoff":
        this.stick(0.2);
        break;
      case "goal":
        this.excitement = Math.min(1, this.excitement + 0.25);
        if (home) {
          this.horn();
          this.swell(2.4, 0.25, 4.5, 3.5, 900);
          window.setTimeout(() => this.organ("goal"), 3800);
        } else this.swell(-0.45, 0.4, 2.5, 3, -250);
        this.applyCrowdLevel();
        break;
      case "lineup":
        if (Math.random() < 0.35) this.organ("charge");
        break;
    }
  }
}

export const gameAudio = new GameAudio();
