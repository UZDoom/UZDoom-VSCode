import Lump, { LoadMode, MatchResult } from "./Lump";
import PlayPal from "./PlayPal";
import DoomFlatDocument from "../Documents/DoomFlat";
export default class DoomFlatLump extends Lump {

    private playpal: PlayPal;
    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        if (loadMode === LoadMode.flats && content.byteLength === 4096) {
            return MatchResult.true;
        }
        return MatchResult.false;
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
        return DoomFlatDocument.getDocumentType();
    }

    getDisplayDocument(uri: any): DoomFlatDocument {
        return new DoomFlatDocument(uri, this.content, { PLAYPAL: this.playpal });
    }
}
