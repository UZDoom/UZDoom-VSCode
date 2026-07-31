import WadDocument from "../Documents/WadDocument";

export enum LumpName {
    FF_START = 'FF_START',
    F_START = 'F_START',
    F1_START = 'F1_START',
    F2_START = 'F2_START',
    F3_START = 'F3_START',
    SS_START = 'SS_START',
    S_START = 'S_START',
    PP_START = 'PP_START',
    P_START = 'P_START',
    P1_START = 'P1_START',
    P2_START = 'P2_START',
    P3_START = 'P3_START',
    FF_END = 'FF_END',
    F_END = 'F_END',
    F1_END = 'F1_END',
    F2_END = 'F2_END',
    F3_END = 'F3_END',
    SS_END = 'SS_END',
    S_END = 'S_END',
    PP_END = 'PP_END',
    P_END = 'P_END',
    P1_END = 'P1_END',
    P2_END = 'P2_END',
    P3_END = 'P3_END',
    PLAYPAL = 'PLAYPAL',
    COLORMAP = 'COLORMAP',
    ENDDOOM = 'ENDDOOM',
    PNAMES = 'PNAMES',
    TEXTURES = 'TEXTURES',
    TEXTURE1 = 'TEXTURE1',
    TEXTURE2 = 'TEXTURE2',
    GENMIDI = 'GENMIDI',
    DMXGUS = 'DMXGUS',
    DEMO1 = 'DEMO1',
    DEMO2 = 'DEMO2',
    DEMO3 = 'DEMO3',

    // Map lumps
    // UMDF
    ZNODES = 'ZNODES',
    SCRIPTS = 'SCRIPTS',
    DIALOGUE = 'DIALOGUE',
    LIGHTMAP = 'LIGHTMAP',
    ENDMAP = 'ENDMAP', // end map marker
    // Doom 2
    // Doom 64
    MACROS = 'MACROS', // Doom 64
    LIGHTS = 'LIGHTS',

    // Doom
    BLOCKMAP = 'BLOCKMAP',
    VERTEXES = 'VERTEXES',
    SECTORS = 'SECTORS',
    SIDEDEFS = 'SIDEDEFS',
    LINEDEFS = 'LINEDEFS',
    SSECTORS = 'SSECTORS',
    NODES = 'NODES',
    SEGS = 'SEGS',
    LEAFS = 'LEAFS',
    REJECT = 'REJECT',
    THINGS = 'THINGS',
    TEXTMAP = 'TEXTMAP',
    BEHAVIOR = 'BEHAVIOR',
    ZSCRIPT = 'ZSCRIPT',
}

export enum LoadMode {
    normal,
    walls,
    sprites,
    flats,
    map
};

export enum MatchResult {
    false,
    unlikely,
    maybe,
    probably,
    true
}

export default class Lump
{
	private _index: number = 0;
	private _name: string = "";
	private _content: ArrayBuffer = new ArrayBuffer(0);
    private _loadMode: LoadMode = LoadMode.normal;

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

    static isThisFormat(name: string, content: ArrayBuffer, loadMode: LoadMode): MatchResult {
        return MatchResult.false;
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

    getDisplayDocument(uri): WadDocument {
        return new WadDocument(uri, this.content, {});
    }

    get documentType(): string {
        return "";
    }

	get length(): number
	{
		return this._content.byteLength; // NB: Add terminator
	}

    get loadMode(): LoadMode {
        return this._loadMode;
    }

    set loadMode(value: LoadMode) {
        this._loadMode = value;
    }

    get isMarker(): boolean { return this.length === 0; }

    constructor(index: number, name: string, content: ArrayBuffer, loadMode: LoadMode, extra: any = {}) {
		this.index = index;
		this.name = name;
        this.loadMode = loadMode;
		this.content = content;
	}
}
