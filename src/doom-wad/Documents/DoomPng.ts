import WadDocument from "./WadDocument";
import ImageDocument from "./ImageDocument";
import { MatchResult } from "../Lumps/Lump";
import { DisplayContentType } from "./ContentType";


export default class DoomPngDocument extends WadDocument implements ImageDocument {

    readonly width: number;
    readonly height: number;
    readonly multipleImages = false;

    static getDocumentType(): string {
        return "png";
    }

    static getDisplayContentType(): DisplayContentType {
        return DisplayContentType.Png;
    }

    get displayContentType(): DisplayContentType {
        return DisplayContentType.Png;
    }

    static isThisFormat(name: string, content: ArrayBuffer): MatchResult {
        // check the first 4 bytes for the PNG header
        if (content.byteLength < 8) return MatchResult.false;
        const view = new DataView(content);
        if (view.getUint32(0, false) !== 0x89504E47) return MatchResult.false;
        if (view.getUint32(4, false) !== 0x0D0A1A0A) return MatchResult.false;
        return MatchResult.true;
    }

    constructor(uri: any, data: ArrayBuffer, extra: any) {
        super(uri, data, extra);
        // get the width and height from the PNG IHDRheader
        const view = new DataView(data);
        // width and height are stored big-endian
        this.width = view.getInt32(16, false);
        this.height = view.getInt32(20, false);
    }

    async getDisplayContent(): Promise<ArrayBuffer> {
        return this.data;
    }
}
