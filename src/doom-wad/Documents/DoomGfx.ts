import WadDocument from "./WadDocument";
import PlayPal from "../Lumps/PlayPal";
import { encodePng, IEncodedPng, IImage32 } from "@lunapaint/png-codec";

export interface PatchHeader {
    width: number; // int16
    height: number; // int16
    left: number; // int16
    top: number; // int16
}
export const PatchHeaderSize = 8;

export default class DoomGfxDocument extends WadDocument {
    private header: PatchHeader;
    private columnOffsets: number[];
    private playpal: PlayPal;

    get width(): number {
        return this.header.width;
    }
    get height(): number {
        return this.header.height;
    }
    get left(): number {
        return this.header.left;
    }
    get top(): number {
        return this.header.top;
    }

    static getDocumentType(): string {
        return "DoomGfx";
    }

    constructor(uri: any, data: ArrayBuffer, extra: { PLAYPAL: PlayPal }) {
        super(uri, data, extra);
        this.header = DoomGfxDocument.parseHeader(data);
        this.columnOffsets = DoomGfxDocument.parseColumnOffsets(data);
        if (!this.extra.PLAYPAL) {
            console.warn('playpal not provided, using default playpal');
            this.playpal = PlayPal.DefaultPlayPal;
        } else {
            this.playpal = extra.PLAYPAL;
        }
    }

    static parseHeader(content: ArrayBuffer): PatchHeader {
        const view = new DataView(content);
        return {
            width: view.getInt16(0),
            height: view.getInt16(2),
            left: view.getInt16(4),
            top: view.getInt16(6),
        };
    }

    static parseColumnOffsets(content: ArrayBuffer): number[] {
        const view = new DataView(content);
        const width = view.getInt16(0);
        const columnOffsets: number[] = [];
        for (let offset = 8; offset < 8 + 4 * width; offset += 4) {
            columnOffsets.push(view.getUint32(offset));
        }
        return columnOffsets;
    }

    private toRawRGBA(): Uint8Array {
        let gfx_data = this.data;
        let width = this.width;
        let height = this.height;
        const version = 0;
        const col_offsets = DoomGfxDocument.parseColumnOffsets(gfx_data);
        // TODO: Actually convert the DoomGfx data to a PNG image

        const rawSize = width * height * 4;
        const rawRGBA = new Uint8Array(rawSize);
        // fill it with 0
        rawRGBA.fill(0);
        let pleiadeshack = false;
        if (height == 256) {
            pleiadeshack = true;
            for (let c = 1; c < width; ++c) {
                if (col_offsets[c] - col_offsets[c - 1] != 261) {
                    pleiadeshack = false;
                    break;
                }
            }
            if (gfx_data.byteLength - col_offsets[width - 1] != 261)
                pleiadeshack = false;
        }


        for (let c = 0; c < width; c++) {
            // Get current column offset (byteswap if needed)
            let col_offset = col_offsets[c]; // wxUINT32_SWAP_ON_BE(col_offsets[c]);

            // Check column offset is valid
            if (col_offset >= gfx_data.byteLength)
                return new Uint8Array();

            // Go to start of column
            let view = new DataView(gfx_data);
            let bits = col_offset;

            // Read posts
            let top = -1;
            while (true) {
                // Get row offset
                let row = view.getUint8(bits);

                if (row == 0xFF) // End of column?
                    break;

                // Tall patches support
                if (row <= top && version == 0)
                    top += row;
                else
                    top = row;

                // Get no. of pixels
                bits++;
                let n_pix = view.getUint16(bits);

                // If this is a Pleiades sky, the height is 256.
                if (pleiadeshack)
                    n_pix = 256;

                if (version == 0)
                    bits++; // Skip buffer
                for (let p = 0; p < n_pix; p++) {
                    // Get pixel position
                    bits++;
                    let pos = ((top + p) * width + c);

                    // Stop if we're outside the image
                    if (pos >= width * height)
                        break;

                    // Stop if for some reason we're outside the gfx data
                    if (bits >= gfx_data.byteLength)
                        break;

                    // Fail if bogus data gives a negative pos (this corrupts the heap!)
                    if (pos < 0)
                        return new Uint8Array();

                    let paletteIndex = view.getUint8(bits);
                    let [r, g, b] = this.playpal.getRGB8Color(paletteIndex);

                    // Write pixel data
                    rawRGBA[pos * 4] = r;
                    rawRGBA[pos * 4 + 1] = g;
                    rawRGBA[pos * 4 + 2] = b;
                    rawRGBA[pos * 4 + 3] = 255;
                }
                if (version == 0)
                    bits++; // Skip buffer
                bits++;     // Go to next row offset
            }
        }
        return rawRGBA;
    }

    private async toPNG(): Promise<ArrayBuffer> {
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
}
