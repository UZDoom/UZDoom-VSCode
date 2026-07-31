import Lump, { LoadMode, MatchResult } from "./Lump";
import DoomGfxDocument, { PatchHeaderSize } from "../Documents/DoomGfx";
import PlayPal from "./PlayPal";
export default class DoomGfxLump extends Lump {

    private playpal: PlayPal;
    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        if (content.byteLength < PatchHeaderSize) return MatchResult.false;
        if (loadMode === LoadMode.sprites || loadMode === LoadMode.walls) return MatchResult.true;
        if (loadMode !== LoadMode.normal) return MatchResult.false;
        const header = DoomGfxDocument.parseHeader(content);
        if (!(header.height > 0 && header.height < 4096 && header.width > 0 && header.width < 4096
            && header.top > -2000 && header.top < 2000 && header.left > -2000 && header.left < 2000)) {
            return MatchResult.false;
        }

        if (content.byteLength < PatchHeaderSize + header.width * 4) {
            return MatchResult.false;
        }
        const columnOffsets = DoomGfxDocument.parseColumnOffsets(content);

        for (let i = 0; i < header.width; i++) {
            if (columnOffsets[i] > content.byteLength || columnOffsets[i] < 8) {
                return MatchResult.false;
            }
        }

        const numpixels = (header.height + 2 + header.height % 2) / 2;
        const maxcolsize = 4 + (numpixels * 5) + 1;
        if (content.byteLength > (PatchHeaderSize + header.width * maxcolsize)) {
            return MatchResult.unlikely;
        }
        return MatchResult.true;
    }

    constructor(index: number, name: string, content: ArrayBuffer, loadMode: LoadMode, extra: { PLAYPAL: PlayPal }) {
        super(index, name, content, loadMode);
        this.playpal = extra.PLAYPAL;
    }

    get documentType(): string {
        return DoomGfxDocument.getDocumentType();
    }

    getDisplayDocument(uri: any): DoomGfxDocument {
        return new DoomGfxDocument(uri, this.content, { PLAYPAL: this.playpal });
    }
}
