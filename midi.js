// Plays the guest's MIDI output on SpessaSynth, a General MIDI synth that runs in the
// page, with the GeneralUser GS sound bank, Vorbis-compressed to SF3 by
// scripts/compress-soundfont.mjs. (Chrome hides Windows' own GS Wavetable
// synth from Web MIDI.) Sound Blaster drivers send MIDI either through the MPU-401 port
// (0x330/0x331) or through DSP commands on port 0x22C; v86 implements neither, so both
// are taken over here.
import { WorkletSynthesizer } from "spessasynth_lib";

// Relative to the page, so the site works from any folder.
const PROCESSOR_URL = "lib/spessasynth_lib/spessasynth_processor.min.js";
const SOUND_BANK_URL = "soundfont/GeneralUser-GS.sf3";

const MPU_DATA = 0x330;
const MPU_ACK = 0xFE;
const MPU_RESET = 0xFF;
const MPU_UART_MODE = 0x3F;

const DSP_RESET = 0x226;
const DSP_WRITE = 0x22C;
const DSP_MIDI_OUT = 0x38; // next byte is MIDI data
const DSP_MIDI_UART_FIRST = 0x34; // 0x34-0x37: every following byte is MIDI data until reset
const DSP_MIDI_UART_LAST = 0x37;

// Counters shown on the page to see which path, if any, the guest uses.
export const midiStats = { mpuBytes: 0, mpuCommands: 0, dspMidiBytes: 0, sent: 0, errors: 0 };

// Number of data bytes that follow each status byte.
function dataLength(status) {
    switch (status & 0xF0) {
        case 0xC0: case 0xD0: return 1;
        case 0xF0: return { 0xF1: 1, 0xF2: 2, 0xF3: 1 }[status] ?? 0;
        default: return 2;
    }
}

// Turns the MIDI byte stream (which may use running status) into complete messages.
export class MidiParser {
    constructor(onMessage) {
        this.onMessage = onMessage;
        this.status = 0;
        this.data = [];
        this.sysex = null;
    }

    push(byte) {
        if (byte >= 0xF8) {
            this.onMessage([byte]); // real-time messages can appear anywhere
            return;
        }
        if (this.sysex) {
            if (byte < 0x80) {
                this.sysex.push(byte);
                return;
            }
            // 0xF7 ends system exclusive; any other status byte cuts it short.
            if (byte === 0xF7) this.onMessage([...this.sysex, 0xF7]);
            this.sysex = null;
            if (byte === 0xF7) return;
        }
        if (byte === 0xF0) {
            this.sysex = [0xF0];
            this.status = 0;
            return;
        }
        if (byte >= 0x80) {
            this.status = byte;
            this.data = [];
            if (dataLength(byte) === 0) this.onMessage([byte]);
            return;
        }
        if (!this.status) return; // data byte with no status yet
        this.data.push(byte);
        if (this.data.length === dataLength(this.status)) {
            this.onMessage([this.status, ...this.data]);
            this.data = [];
            // System common messages don't set up running status.
            if (this.status >= 0xF0) this.status = 0;
        }
    }
}

async function startSynth(context, output) {
    await context.audioWorklet.addModule(PROCESSOR_URL);
    const synth = new WorkletSynthesizer(context);
    synth.connect(output);
    const soundBank = await (await fetch(SOUND_BANK_URL)).arrayBuffer();
    await synth.soundBankManager.addSoundBank(soundBank, "main");
    await synth.isReady;
    return synth;
}

// output: the audio node the synth plays into (the page's volume control).
export async function connectMidi(emulator, output, onStatus) {
    // Take over the ports straight away so the guest always sees a working MPU-401;
    // messages are dropped until the synth has loaded.
    let synth = null;
    const sb16 = emulator.v86.cpu.devices.sb16;
    const io = emulator.v86.cpu.io;
    const parser = new MidiParser(message => {
        if (!synth) return;
        try {
            synth.sendMessage(message);
            midiStats.sent++;
        } catch {
            midiStats.errors++;
        }
    });

    io.register_write_consecutive(
        MPU_DATA,
        sb16,
        byte => {
            midiStats.mpuBytes++;
            parser.push(byte);
        },
        command => {
            midiStats.mpuCommands++;
            // Acknowledge reset and UART mode, as a real MPU-401 does.
            if (command === MPU_RESET || command === MPU_UART_MODE) {
                sb16.mpu_read_buffer.clear();
                sb16.mpu_read_buffer.push(MPU_ACK);
            }
        },
    );

    // Intercept the DSP's MIDI commands before v86's own handler sees them.
    let dspUart = false;
    let dspMidiByteNext = false;
    const dspWrite = io.ports[DSP_WRITE].write8;
    io.ports[DSP_WRITE].write8 = function (value) {
        if (dspUart || dspMidiByteNext) {
            dspMidiByteNext = false;
            midiStats.dspMidiBytes++;
            parser.push(value);
            return;
        }
        if (sb16.command === 0 && value === DSP_MIDI_OUT) {
            dspMidiByteNext = true;
            return;
        }
        if (sb16.command === 0 && value >= DSP_MIDI_UART_FIRST && value <= DSP_MIDI_UART_LAST) {
            dspUart = true;
            return;
        }
        dspWrite.call(this, value);
    };
    const dspReset = io.ports[DSP_RESET].write8;
    io.ports[DSP_RESET].write8 = function (value) {
        dspUart = false;
        dspMidiByteNext = false;
        dspReset.call(this, value);
    };

    // Silence hanging notes when the emulator pauses.
    emulator.add_listener("emulator-stopped", () => synth?.stopAll(true));

    onStatus("loading sound bank");
    try {
        synth = await startSynth(emulator.speaker_adapter.audio_context, output);
        window.midiSynth = synth; // for debugging from the console
        onStatus("GeneralUser GS");
    } catch (error) {
        onStatus(`synth failed (${error.message})`);
    }
}
