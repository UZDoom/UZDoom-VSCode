import { MatchResult } from "../Lumps/Lump";
import PlayPal from "../Lumps/PlayPal";
import ImageDocument from "./ImageDocument";
import WadDocument from "./WadDocument";
import { encodePng, IEncodedPng } from "@lunapaint/png-codec";
import { DisplayContentType } from "./ContentType";

export default class DoomFlatDocument extends WadDocument implements ImageDocument {

    private playpal: PlayPal;

    readonly width = 64;
    readonly height = 64;

    static isThisFormat(name: string, content: ArrayBuffer): MatchResult {
        if (content.byteLength === 4096) {
            return MatchResult.probably;
        }
        return MatchResult.false;
    }

    constructor(uri: any, data: ArrayBuffer, extra: { PLAYPAL: PlayPal }) {
        super(uri, data, extra);
        if (!this.extra.PLAYPAL) {
            console.warn('playpal not provided, using default playpal');
            this.playpal = PlayPal.DefaultPlayPal;
        } else {
            this.playpal = extra.PLAYPAL;
        }
    }

    static getDisplayContentType(): DisplayContentType {
        return DisplayContentType.Png;
    }

    get displayContentType(): DisplayContentType {
        return DoomFlatDocument.getDisplayContentType();
    }

    static getDocumentType(): string {
        return "DoomFlat";
    }

    private toRawRGBA(): Uint8Array {
        const rawSize = 4096 * 4;
        const rawRGBA = new Uint8Array(rawSize);
        const view = new DataView(this.data);
        for (let i = 0; i < 4096; i++) {
            const paletteIndex = view.getUint8(i);
            const [r, g, b] = this.playpal.getRGB8Color(paletteIndex);
            rawRGBA[i * 4] = r;
            rawRGBA[i * 4 + 1] = g;
            rawRGBA[i * 4 + 2] = b;
            rawRGBA[i * 4 + 3] = 255;
        }
        return rawRGBA;
    }

    async toPNG(): Promise<ArrayBuffer> {
        const rawRGBA = this.toRawRGBA();
        const png: IEncodedPng = await encodePng({
            width: this.width,
            height: this.height,
            data: rawRGBA,
        });
        return new Uint8Array(png.data).buffer;
    }

    async getDisplayContent(): Promise<ArrayBuffer> {
        return await this.toPNG();
    }

    dispose(): void {
        super.dispose();
    }
}
