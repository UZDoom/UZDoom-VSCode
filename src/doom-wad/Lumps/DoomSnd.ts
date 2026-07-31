import Lump, { LoadMode, MatchResult } from "./Lump";
import DoomSndDocument from "../Documents/DoomSnd";
export default class DoomSndLump extends Lump {

    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        if (content.byteLength > 8) {
            const header = DoomSndDocument.parseHeader(content);
            if ((header.three == 3 || header.three == 0x300) && header.samples <= (content.byteLength - 8) && header.samples > 4 && header.samplerate >= 8000) {
                return MatchResult.true;
            }
        }
        return MatchResult.false;
    }

    get documentType(): string {
        return DoomSndDocument.getDocumentType();
    }

    getDisplayDocument(uri: any): DoomSndDocument {
        return new DoomSndDocument(uri, this.content, {});
    }
}
