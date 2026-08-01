import Lump, { LoadMode, MatchResult } from "./Lump";
import DoomSndDocument from "../Documents/DoomSnd";
export default class DoomSndLump extends Lump {

    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        return DoomSndDocument.isThisFormat(name, content);
    }

    get documentType(): string {
        return DoomSndDocument.getDocumentType();
    }

    getDisplayDocument(uri: any): DoomSndDocument {
        return new DoomSndDocument(uri, this.content, {});
    }
}
