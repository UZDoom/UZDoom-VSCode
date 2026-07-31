import Lump, { LoadMode, MatchResult } from "./Lump";
import DoomGfxDocument from "../Documents/DoomGfx";
import PlayPal from "./PlayPal";
export default class DoomGfxLump extends Lump {

    private playpal: PlayPal;
    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        if (loadMode === LoadMode.sprites || loadMode === LoadMode.walls) return MatchResult.true;
        if (loadMode !== LoadMode.normal) return MatchResult.false;
        return DoomGfxDocument.isThisFormat(name, content);
    }

    constructor(index: number, name: string, content: ArrayBuffer, loadMode: LoadMode, extra: { PLAYPAL: PlayPal }) {
        super(index, name, content, loadMode);
        if (!extra.PLAYPAL) {
            console.warn('playpal not provided, using default playpal');
            this.playpal = PlayPal.DefaultPlayPal;
        } else {
            this.playpal = extra.PLAYPAL;
        }
    }

    get documentType(): string {
        return DoomGfxDocument.getDocumentType();
    }

    getDisplayDocument(uri: any): DoomGfxDocument {
        return new DoomGfxDocument(uri, this.content, { PLAYPAL: this.playpal });
    }
}
