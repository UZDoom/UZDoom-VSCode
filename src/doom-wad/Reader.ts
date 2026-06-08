import Wad, { WadType } from "./Wad";
import ParseError from "./Exceptions/ParseError";
import Lump from "./Lumps/Lump";
import LumpFactory from "./Lumps/LumpFactory";

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

	private readDictionaryAndLumps(): void
	{
		const lumps: Lump[] = [];

		this.seek(this.dictionaryOffset!);

		let totalLength = 0;

		for(let i = 0; i < this.numLumps!; i++)
		{
			let position	= this.readInt32();
			let length		= this.readInt32();

			totalLength += length;

			const name = this.readString(8);
            let lump = LumpFactory.createFromName(name, i, this.input!.slice(position, position + length));
			// console.debug(`Read lump ${lump.name} will be at position 0x${position.toString(16)} with length 0x${length.toString(16)}`);

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
