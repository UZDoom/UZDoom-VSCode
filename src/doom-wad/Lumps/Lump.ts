export default class Lump
{
	private _name: string = "";
	private _content: ArrayBuffer = new ArrayBuffer(0);

    static isValidName(name: string): boolean {
        return /^[A-Z0-9\[\]\-_\\]+$/.test(name);
    }

    static sanitizeName(name: string): string {
        name = name.trim().replace(/\0+$/g, "");
        if (name.startsWith("\\")) {
            name = name.substring(1);
        }
        if (name.endsWith("**")) {
            name = name.substring(0, name.length - 2);
        }
        return name;
    }

	get name(): string
	{
		return this._name;
	}

	set name(value: string)
	{
        value = Lump.sanitizeName(value);
        if (!Lump.isValidName(value)) {
            console.warn(`Invalid lump name ${value}`);
            return;
        }

		if(value.length > 8)
        {
			console.warn(`Name ${value} will be truncated`);

			value = value.substring(0, 8);
		}

		this._name = value + Array( 8 - value.length + 1 ).join("\x00");
	}

	get content(): ArrayBuffer
	{
		return this._content;
	}

	set content(value: ArrayBuffer)
	{
		this._content = value;
	}

	get length(): number
	{
		return this.content.byteLength; // NB: Add terminator
	}
}
