import { MatchResult } from "../Lumps/Lump";
import ImageDocument from "./ImageDocument";
import WadDocument from "./WadDocument";
import { encodePng, IEncodedPng } from "@lunapaint/png-codec";
import { DisplayContentType } from "./ContentType";

const PALETTE_COLORS = 256;
const PALETTE_BYTE_SIZE = PALETTE_COLORS * 3;

const PALETTE_SQUARE_SIZE = 16;
const PALETTE_COLOR_DISPLAY_PIXELS = 16;
const SINGLE_PALETTE_PIXEL_ROW_STRIDE = PALETTE_SQUARE_SIZE * PALETTE_COLOR_DISPLAY_PIXELS;

export default class PlaypalDocument extends WadDocument implements ImageDocument {
    static isThisFormat(name: string, content: ArrayBuffer): MatchResult {
        if (name == "PLAYPAL" && content.byteLength % 768 === 0) {
            return MatchResult.true;
        }
        return MatchResult.false;
    }

    get numberOfPalettes(): number {
        return (this.data.byteLength / PALETTE_BYTE_SIZE);
    }

    private getPaletteSquareDimension(): number {
        return Math.round(Math.sqrt(this.numberOfPalettes));
    }

    private getDisplayPixelDimension(): number {
        return this.getPaletteSquareDimension() * PALETTE_SQUARE_SIZE * PALETTE_COLOR_DISPLAY_PIXELS;
    }

    get width(): number {
        return this.getDisplayPixelDimension();
    }

    get height(): number {
        return this.getDisplayPixelDimension();
    }


    constructor(uri: any, data: ArrayBuffer, extra) {
        super(uri, data, extra);
    }

    static getDisplayContentType(): DisplayContentType {
        return DisplayContentType.Png;
    }

    get displayContentType(): DisplayContentType {
        return PlaypalDocument.getDisplayContentType();
    }

    static getDocumentType(): string {
        return "DoomPlayPal";
    }

    private static getRGBA32Color(view: DataView, index: number, paletteNum: number): number {
        // one pixel is 4 bytes
        const offset = index * 3 + paletteNum * PALETTE_BYTE_SIZE;
        const [r, g, b] = [view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2)];
        const a = 255;
        return (a << 24) | (b << 16) | (g << 8) | r;
    }

    private static writeOnePaletteToRawRGBA(rawRGBA: Uint32Array, view: DataView, paletteNum: number, palOffset: number = 0, wholeRowSize: number = SINGLE_PALETTE_PIXEL_ROW_STRIDE): void {
        for (let idx = 0; idx < PALETTE_COLORS; idx++) {
            const colorX: number = idx % PALETTE_SQUARE_SIZE;
            const colorY: number = Math.floor(idx / PALETTE_SQUARE_SIZE);
            const colorXOffset: number = colorX * PALETTE_COLOR_DISPLAY_PIXELS;
            const colorYOffset: number = colorY * PALETTE_COLOR_DISPLAY_PIXELS * wholeRowSize;
            const colorOrigin: number = colorXOffset + colorYOffset;
            const color = PlaypalDocument.getRGBA32Color(view, idx, paletteNum);
            for (let x = 0; x < PALETTE_COLOR_DISPLAY_PIXELS; x++) {
                for (let y = 0; y < PALETTE_COLOR_DISPLAY_PIXELS; y++) {
                    rawRGBA[palOffset + colorOrigin + x + y * wholeRowSize] = color;
                }
            }
        }
    }

    private toRawRGBA(): Uint8Array {
        const rawSize = this.width * this.height;
        const rawRGBA = new Uint32Array(rawSize);
        const view = new DataView(this.data);
        const numberOfPalettes = this.numberOfPalettes;
        const squareDimension = this.getPaletteSquareDimension();
        const pixelDimension = this.getDisplayPixelDimension();
        const wholeRowSize = pixelDimension;


        for (let palnum = 0; palnum < numberOfPalettes; palnum++) {
            const squareX: number = (palnum % squareDimension);
            const squareY: number = Math.floor(palnum / squareDimension);
            const palXOrigin: number = squareX * SINGLE_PALETTE_PIXEL_ROW_STRIDE;
            const palYOrigin: number = squareY * SINGLE_PALETTE_PIXEL_ROW_STRIDE * wholeRowSize;
            const palOffset: number = palXOrigin + palYOrigin;
            PlaypalDocument.writeOnePaletteToRawRGBA(rawRGBA, view, palnum, palOffset, wholeRowSize);
        }
        return new Uint8Array(rawRGBA.buffer);
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
