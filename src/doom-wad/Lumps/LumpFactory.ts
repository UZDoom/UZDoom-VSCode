import Lump, { LoadMode, MatchResult } from "./Lump";
import Textmap from "./Textmap";
import PlayPal from "./PlayPal";
import DoomGfxLump from "./DoomGfx";
import DoomFlatLump from "./DoomFlat";
import DoomSndLump from "./DoomSnd";
export default class LumpFactory
{
	private static classesByName: Record<string, typeof Lump> = {};
    private static detectFunctions: Record<string, { constructor: typeof Lump, isThisFormat: (name: string, content: ArrayBuffer, loadMode: LoadMode) => MatchResult }> = {};

	static registerClassForName(name: string, constructor: typeof Lump)
	{
		LumpFactory.classesByName[name.toUpperCase()] = constructor;
	}

    static registerDetectFunction(constructor: typeof Lump) {
        LumpFactory.detectFunctions[constructor.name] = { constructor, isThisFormat: constructor.isThisFormat };
    }

    static createFromName(name: string, index: number, content: ArrayBuffer, loadMode: LoadMode, specialLumps: { [name: string]: Lump } = {})
	{
        let result: Lump;
        const trimmedName = Lump.trimName(name);
        const normalizedName = Lump.sanitizeName(name).toUpperCase();
        if ((normalizedName in LumpFactory.classesByName))
            result = new LumpFactory.classesByName[normalizedName](index, trimmedName, content, loadMode, specialLumps);
        else {
            let found = false;
            let candidates: { constructor: typeof Lump, matchResult: MatchResult }[] = [];
            for (const [_n, { constructor, isThisFormat }] of Object.entries(LumpFactory.detectFunctions)) {
                let matchResult = isThisFormat(normalizedName, content, loadMode);
                if (matchResult === MatchResult.true) {
                    result = new constructor(index, trimmedName, content, loadMode, specialLumps);
                    found = true;
                    break;
                } else if (matchResult !== MatchResult.false) {
                    candidates.push({ constructor, matchResult });
                }
            }
            if (!found) {
                if (candidates.length > 0) {
                    candidates.sort((a, b) => a.matchResult - b.matchResult);
                    result = new candidates[0].constructor(index, trimmedName, content, loadMode, specialLumps);
                } else {
                    result = new Lump(index, trimmedName, content, loadMode, specialLumps);
                }
            }
        }
        return result!;
	}
}

LumpFactory.registerClassForName("TEXTMAP", Textmap);
LumpFactory.registerClassForName("PLAYPAL", PlayPal);
LumpFactory.registerDetectFunction(DoomGfxLump);
LumpFactory.registerDetectFunction(DoomFlatLump);
LumpFactory.registerDetectFunction(DoomSndLump);
