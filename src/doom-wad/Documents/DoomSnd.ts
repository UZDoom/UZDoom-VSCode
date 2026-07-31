import { MatchResult } from "../Lumps/Lump";
import { DisplayContentType } from "./ContentType";
import WadDocument from "./WadDocument";

export interface DoomSndHeader {
    three: number; // u16
    samplerate: number; // u16
    samples: number; // u32
}

export default class DoomSndDocument extends WadDocument {
    constructor(uri: any, data: ArrayBuffer, extra: any) {
        super(uri, data, extra);
    }

    static isThisFormat(name: string, content: ArrayBuffer): MatchResult {
        if (content.byteLength > 8) {
            const header = DoomSndDocument.parseHeader(content);
            if ((header.three == 3 || header.three == 0x300) && header.samples <= (content.byteLength - 8) && header.samples > 4 && header.samplerate >= 8000) {
                return MatchResult.true;
            }
        }
        return MatchResult.false;
    }

    static getDisplayContentType(): DisplayContentType {
        return DisplayContentType.Wav;
    }

    get displayContentType(): DisplayContentType {
        return DoomSndDocument.getDisplayContentType();
    }

    static parseHeader(content: ArrayBuffer): DoomSndHeader {
        const view = new DataView(content);
        let header: DoomSndHeader = {
            three: view.getUint16(0, true),
            samplerate: view.getUint16(2, true),
            samples: view.getUint32(4, true),
        };

        // Some sounds created on Mac platforms have their identifier and samplerate
        // in BE format. The number of samples is still in LE. parseHeader reads
        // everything as LE, so for the Mac variant (three == 0x300) we need to
        // re-read samplerate as BE.
        if (header.three === 0x300) {
            header.samplerate = view.getUint16(2, false);
        }

        return header;
    }
    static getDocumentType(): string {
        return "DoomSnd";
    }

    async getDisplayContent(): Promise<ArrayBuffer> {
        return await this.toWAV();
    }
    async toWAV(): Promise<ArrayBuffer> {
        // --- Read Doom sound ---
        if (this.data.byteLength < 8) {
            throw new Error("Invalid Doom Sound");
        }

        const header = DoomSndDocument.parseHeader(this.data);

        if (header.three !== 3 && header.three !== 0x300) {
            throw new Error("Invalid Doom Sound");
        }
        if (header.samples > this.data.byteLength - 8 || header.samples <= 4) {
            throw new Error("Invalid Doom Sound");
        }

        const samples = new Uint8Array(this.data, 8, header.samples);

        let sampleCount = header.samples;

        // Detect DMX padding: 16 leading bytes that copy the first real sample,
        // and 16 trailing bytes that copy the last real sample. The header's
        // sample count includes these 32 padding bytes.
        let samplesOffset = 16;
        if (header.samples > 33) {
            const e = header.samples - 16;
            for (let i = 0; i < 16; i++) {
                if (samples[i] !== samples[16] || samples[e + i] !== samples[e - 1]) {
                    samplesOffset = 0;
                    break;
                }
            }
        } else {
            samplesOffset = 0;
        }

        if (samplesOffset > 0) {
            sampleCount -= 32;
        }

        // --- Write WAV ---
        const fmtChunkSize = 16;
        const dataChunkSize = sampleCount;
        const riffSize = dataChunkSize + fmtChunkSize + 20;
        const padByte = sampleCount % 2 !== 0 ? 1 : 0;
        const totalSize = 8 + riffSize + padByte;

        const out = new ArrayBuffer(totalSize);
        const outView = new DataView(out);
        const outBytes = new Uint8Array(out);
        let offset = 0;

        const writeAscii = (s: string) => {
            for (let i = 0; i < s.length; i++) {
                outBytes[offset + i] = s.charCodeAt(i);
            }
            offset += s.length;
        };

        writeAscii("RIFF");
        outView.setUint32(offset, riffSize, true); offset += 4;
        writeAscii("WAVE");

        writeAscii("fmt ");
        outView.setUint32(offset, fmtChunkSize, true); offset += 4;
        outView.setUint16(offset, 1, true); offset += 2;                    // tag = PCM
        outView.setUint16(offset, 1, true); offset += 2;                    // channels
        outView.setUint32(offset, header.samplerate, true); offset += 4;
        outView.setUint32(offset, header.samplerate, true); offset += 4;    // datarate
        outView.setUint16(offset, 1, true); offset += 2;                    // blocksize
        outView.setUint16(offset, 8, true); offset += 2;                    // bps

        writeAscii("data");
        outView.setUint32(offset, dataChunkSize, true); offset += 4;
        outBytes.set(samples.subarray(samplesOffset, samplesOffset + sampleCount), offset);

        return out;
    }
}
