export default class Lump
{
	private _index: number = 0;
	private _name: string = "";
	private _content: ArrayBuffer = new ArrayBuffer(0);

	static isValidName(name: string): boolean {
		// return /^[A-Z0-9\[\]\-_\\]+$/.test(name);
		// the above test is incorrect; doom allows all printable ascii characters
		return /^[\x20-\x7E]+$/.test(name);
	}


	static trimName(name: string): string {
		return name.trim().replace(/\0+$/g, "");
	}

	static sanitizeName(name: string): string {
		let result = Lump.trimName(name);
		result = result.replace(/[^\x20-\x7E]/g, "_");
		return result;
	}

	get index(): number {
		return this._index;
	}

	set index(value: number) {
		this._index = value;
	}

	get name(): string
	{
		return this._name;
	}

	set name(value: string)
	{
		value = Lump.trimName(value);
		if(value.length > 8)
		{
			console.warn(`Name ${value} will be truncated`);
			value = value.substring(0, 8);
		}
		this._name = value;
		if (!Lump.isValidName(value)) {
			this._name = Lump.sanitizeName(value);
			console.warn(`Invalid lump name ${value}, renaming to ${this._name}`);
        }
	}

	get content(): ArrayBuffer
	{
		return this._content;
	}

	set content(value: ArrayBuffer)
	{
		this._content = value;
	}

	get rawContent(): ArrayBuffer {
		return this._content;
	}

	get length(): number
	{
		return this._content.byteLength; // NB: Add terminator
	}

	constructor(index: number, name: string, content: ArrayBuffer) {
		this.index = index;
		this.name = name;
		this.content = content;
	}
}
