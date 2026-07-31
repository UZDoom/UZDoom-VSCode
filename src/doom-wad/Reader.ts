import Wad, { WadType } from "./Wad";
import ParseError from "./Exceptions/ParseError";
import Lump, { LoadMode, LumpName } from "./Lumps/Lump";
import LumpFactory from "./Lumps/LumpFactory";

interface LumpInfo {
    name: string;
    position: number;
    length: number;
    mode: LoadMode;
}

export default class Reader
{
	private wad: Wad;
	private input?: ArrayBuffer;
	private view?: DataView;

	private cursor?: number;
	private numLumps?: number;
	private dictionaryOffset?: number;

	constructor(wad: Wad)
	{
		this.wad = wad;
	}

	private rewind(): void
	{
		this.cursor = 0;
	}

	private seek(to: number): void
	{
		if(to < 0 || to >= this.view!.byteLength)
			throw new RangeError("Attempted to seek out of range");

		this.cursor = to;
	}

	private readUint8(): number
	{
		const result: number = this.view!.getUint8(this.cursor!);

		this.cursor!++;

		return result;
	}

	private readInt32()
	{
		const result: number = this.view!.getInt32(this.cursor!, true);

		this.cursor! += 4;

		return result;
	}

	private readString(length: number): string
	{
		if(length == 0)
			return "";

		const chars: number[] = [];

		for(let i = 0; i < length; i++)
			chars.push(this.readUint8());

		return String.fromCharCode.apply(String, chars);
	}

	private readHeader(): void
	{
		const type: WadType = this.readString(4) as WadType;

		if(!(type in WadType))
			throw new ParseError("Invalid type in WAD header");

		this.wad.type			= type;

		this.numLumps			= this.readInt32();
		this.dictionaryOffset	= this.readInt32();

		// console.debug(`Read WAD type ${type} with ${this.numLumps} lumps, dictionary offset at 0x${this.dictionaryOffset.toString(16)}`);
	}

    private isMapLump(name: string): boolean {
        switch (name) {
            // case LumpName.ENDMAP:
            case LumpName.ZNODES:
            case LumpName.SCRIPTS:
            case LumpName.DIALOGUE:
            case LumpName.LIGHTMAP:
            case LumpName.MACROS:
            case LumpName.LIGHTS:
            case LumpName.BLOCKMAP:
            case LumpName.VERTEXES:
            case LumpName.SECTORS:
            case LumpName.SIDEDEFS:
            case LumpName.LINEDEFS:
            case LumpName.SSECTORS:
            case LumpName.NODES:
            case LumpName.SEGS:
            case LumpName.LEAFS:
            case LumpName.REJECT:
            case LumpName.THINGS:
            case LumpName.TEXTMAP:
            case LumpName.BEHAVIOR:
            case LumpName.ZSCRIPT:
                return true;
            default:
                return false;
        }
    }

    private isSpecialLump(name: string): boolean {
        switch (name) {
            case LumpName.PLAYPAL:
            case LumpName.COLORMAP:
                return true;
            default:
                return false;
        }
    }

	private readDictionaryAndLumps(): void
	{
		const lumps: Lump[] = [];
        const lumpsInfo: LumpInfo[] = [];

		this.seek(this.dictionaryOffset!);

        // let totalLength = 0;
        let mode: LoadMode = LoadMode.normal;

		for(let i = 0; i < this.numLumps!; i++)
		{
			let position	= this.readInt32();
			let length		= this.readInt32();

            // totalLength += length;

            const name = Lump.trimName(this.readString(8));
            switch (name) {
                case LumpName.FF_START:
                case LumpName.F_START:
                case LumpName.F1_START:
                case LumpName.F2_START:
                case LumpName.F3_START:
                    mode = LoadMode.flats;
                    break;
                case LumpName.SS_START:
                case LumpName.S_START:
                    mode = LoadMode.sprites;
                    break;
                case LumpName.PP_START:
                case LumpName.P_START:
                case LumpName.P1_START:
                case LumpName.P2_START:
                case LumpName.P3_START:
                    mode = LoadMode.walls;
                    break;
                case LumpName.FF_END:
                case LumpName.F_END:
                case LumpName.F1_END:
                case LumpName.F2_END:
                case LumpName.F3_END:
                case LumpName.SS_END:
                case LumpName.S_END:
                case LumpName.P_END:
                case LumpName.P1_END:
                case LumpName.P2_END:
                case LumpName.P3_END:
                    mode = LoadMode.normal;
                    break;
                default:
                    break;
            }
            lumpsInfo.push({ name, position, length, mode });
        }
        let specialLumps: { [name: string]: Lump } = {};
        for (let i = 0; i < lumpsInfo.length; i++) {
            const { name, position, length, mode } = lumpsInfo[i];
            let newMode = mode;
            if (length === 0 && mode === LoadMode.normal) {
                if (i + 1 < lumpsInfo.length && this.isMapLump(lumpsInfo[i + 1].name)) {
                    newMode = LoadMode.map;
                    for (let j = i + 1; j < lumpsInfo.length; j++) {
                        if (!this.isMapLump(lumpsInfo[j].name)) {
                            break;
                        }
                        lumpsInfo[j].mode = LoadMode.map;
                    }
                }
            }
            let lump = LumpFactory.createFromName(name, i, this.input!.slice(position, position + length), newMode, specialLumps);

            if (this.isSpecialLump(name)) {
                specialLumps[name] = lump;
            }
			lumps.push(lump);
		}

		// console.debug(`Dictionary offset is 0x${this.dictionaryOffset.toString(16)}`);

		// console.debug(`Dictionary specifies total lump size is 0x${totalLength.toString(16)}`);

		this.wad.lumps = lumps;

		// console.debug(`Readback length is 0x` + this.wad.lumpsTotalByteLength.toString(16));
	}

	read(input: ArrayBuffer)
	{
		this.input = input;
		this.view = new DataView(input);

		this.rewind();

		try{

			this.readHeader();
			this.readDictionaryAndLumps();

		}catch(e) {

			if(e instanceof RangeError)
				throw new ParseError("End of file reached unexpectedly");
			else
				throw e;

		}
	}

}
