import Wad from "./Wad";

export default class Writer
{
	private wad: Wad;

	private output?: ArrayBuffer;
	private view?: DataView;
	private cursor?: number;

	constructor(wad: Wad)
	{
		this.wad = wad;
	}

	getBufferSize(): number
	{
		let result = 0xC;	// NB: Start with header size

		for(const lump of this.wad.lumps)
		{
			// NB: Add the dictionary entry position, length, and name
			result += 0x10;

			// NB: Add the payload of the lump
			result += lump.length;
		}

		return result;
	}

	private rewind(): void
	{
		this.cursor = 0;
	}

	private writeUint8(value: number): void
	{
		if(value < 0 || value > 0xFF)
			throw new RangeError(`Invalid byte value ${value}`);

		this.view!.setUint8(this.cursor!, value);

		this.cursor!++;
	}

	private writeInt32(value: number): void
	{
		if(value < 0 || value > 0x7FFFFFFF)
			throw new RangeError(`Invalid 32-bit value ${value}`);

		this.view!.setInt32(this.cursor!, value, true);

		this.cursor! += 4;
	}

	private writeString(string: string): void
	{
		for(let i = 0; i < string.length; i++)
		{
			const charCode = string.charCodeAt(i);

			if(charCode > 0xFF)
			{
				const character = String.fromCharCode(charCode);

				throw new RangeError(`Character ${character} cannot be represented by an ASCII byte`);
			}

			this.writeUint8(charCode);
		}
	}

	private writePaddedString(string: string, length: number): void
	{
		if(string.length > length)
			throw new RangeError("String exceeds maximum specified padded string length");

		this.writeString(string);

		for(let i = string.length; i < length; i++)
			this.writeUint8(0);
	}

	private writeArrayBuffer(data: ArrayBuffer)
	{
		if(data.byteLength == 0)
			return;

		const view = new Uint8Array(this.output!, 0, this.output!.byteLength);

		view.set(new Uint8Array(data), this.cursor);

		this.cursor! += data.byteLength;
	}

	private writeHeader(): void
	{
		// console.debug(`Writing WAD type ${this.wad.type} at ${this.cursor.toString(16)}`);

		this.writeString(this.wad.type);

		// console.debug(`Writing count of ${this.wad.lumps.length} at ${this.cursor.toString(16)}`);

		this.writeInt32(this.wad.lumps.length);

		// NB: Add four bytes to account for the dictionary size 32-bit uint itself
		// console.debug("Writing calculated dictionary offset 0x" + (this.cursor + 4 + this.wad.lumpsTotalByteLength).toString(16) + " at 0x" + this.cursor.toString(16));

		this.writeInt32(this.cursor! + 4 + this.wad.lumpsTotalByteLength);
	}

	private writeLumpsAndDictionary(): void
	{
		const lumpPositions: number[] = [];
        // let count = 1;

		for(const lump of this.wad.lumps)
		{
			// console.debug(`Writing lump ${count} / ${this.wad.lumps.length} at 0x${this.cursor.toString(16)}`);
            // count++;

			lumpPositions.push(this.cursor!);

			if(lump.content.byteLength == 0)
				continue;

			// console.debug(`Writing ${lump.content.byteLength} bytes of lump content at 0x${this.cursor.toString(16)}`);

			this.writeArrayBuffer(lump.content);
		}

		// NB: Now write the dictionary
		let index = 0;

		for(const lump of this.wad.lumps)
		{
			// NB: Somewhere I read that virtual lumps (such as F_START) only exist in the dictionary, having a size of 0 and that therefore offset value is nonsensical and often 0, however, I found Slade does preserve these offsets - we mirror this behaviour and write the position.
			this.writeInt32(lumpPositions[index]);

			this.writeInt32(lump.content.byteLength);
			this.writePaddedString(lump.name, 8);

			index++;
		}
	}

	write(output: ArrayBuffer)
	{
		this.output = output;
		this.view = new DataView(output);

		this.rewind();
		this.writeHeader();
		this.writeLumpsAndDictionary();
	}
}
