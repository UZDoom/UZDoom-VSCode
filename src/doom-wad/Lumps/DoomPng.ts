import Lump, { LoadMode, MatchResult } from "./Lump";
import DoomPngDocument from "../Documents/DoomPng";
export default class DoomPngLump extends Lump {

    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        return DoomPngDocument.isThisFormat(name, content);
    }
    get documentType(): string {
        return DoomPngDocument.getDocumentType();
    }
    getDisplayDocument(uri: any): DoomPngDocument {
        return new DoomPngDocument(uri, this.content, {});
    }
}
