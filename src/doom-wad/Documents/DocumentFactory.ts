import DoomGfxDocument from "./DoomGfx";
import DoomFlatDocument from "./DoomFlat";
import DoomSndDocument from "./DoomSnd";
import { MatchResult } from "../Lumps/Lump";
import WadDocument from "./WadDocument";
import PlaypalDocument from "./Playpal";
import DoomPngDocument from "./DoomPng";

export default class DocumentFactory {

    private static detectFunctions: Record<string, { constructor: typeof WadDocument, isThisFormat: (name: string, content: ArrayBuffer) => MatchResult }> = {};

    static registerDetectFunction(constructor: typeof WadDocument) {
        DocumentFactory.detectFunctions[constructor.name] = { constructor, isThisFormat: constructor.isThisFormat };
    }

    static getDocumentConstructor(name: string, content: ArrayBuffer): typeof WadDocument {
        let candidates: { constructor: typeof WadDocument, matchResult: MatchResult }[] = [];
        for (const [_n, { constructor, isThisFormat }] of Object.entries(DocumentFactory.detectFunctions)) {
            let matchResult = isThisFormat(name, content);
            if (matchResult === MatchResult.true) {
                return constructor;
            } else if (matchResult !== MatchResult.false) {
                candidates.push({ constructor, matchResult });
            }
        }
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.matchResult - b.matchResult);
            return candidates[0].constructor;
        }
        return WadDocument;
    }

    static create(uri: any, name: string, content: ArrayBuffer, extra: any) {
        let result = new (DocumentFactory.getDocumentConstructor(name, content))(uri, content, extra);
        return result;
    }
}

DocumentFactory.registerDetectFunction(DoomGfxDocument);
DocumentFactory.registerDetectFunction(DoomSndDocument);
DocumentFactory.registerDetectFunction(PlaypalDocument);
DocumentFactory.registerDetectFunction(DoomPngDocument);
DocumentFactory.registerDetectFunction(DoomFlatDocument);
