import DoomGfxDocument from "./DoomGfx";
import DoomFlatDocument from "./DoomFlat";
import DoomSndDocument from "./DoomSnd";
import { MatchResult } from "../Lumps/Lump";
import WadDocument from "./WadDocument";
import PlaypalDocument from "./Playpal";

export default class DocumentFactory {

    private static detectFunctions: Record<string, { constructor: typeof WadDocument, isThisFormat: (name: string, content: ArrayBuffer) => MatchResult }> = {};

    static registerDetectFunction(constructor: typeof WadDocument) {
        DocumentFactory.detectFunctions[constructor.name] = { constructor, isThisFormat: constructor.isThisFormat };
    }

    static create(uri: any, name: string, content: ArrayBuffer, extra: any) {
        let result: WadDocument;
        let found = false;
        let candidates: { constructor: typeof WadDocument, matchResult: MatchResult }[] = [];
        for (const [_n, { constructor, isThisFormat }] of Object.entries(DocumentFactory.detectFunctions)) {
            let matchResult = isThisFormat(name, content);
            if (matchResult === MatchResult.true) {
                result = new constructor(uri, content, extra);
                found = true;
                break;
            } else if (matchResult !== MatchResult.false) {
                candidates.push({ constructor, matchResult });
            }
        }
        if (!found) {
            if (candidates.length > 0) {
                candidates.sort((a, b) => a.matchResult - b.matchResult);
                result = new candidates[0].constructor(uri, content, extra);
            } else {
                result = new WadDocument(uri, content, extra);
            }
        }
        return result!;
    }
}

DocumentFactory.registerDetectFunction(DoomGfxDocument);
DocumentFactory.registerDetectFunction(DoomSndDocument);
DocumentFactory.registerDetectFunction(PlaypalDocument);
DocumentFactory.registerDetectFunction(DoomPngDocument);
DocumentFactory.registerDetectFunction(DoomFlatDocument);
