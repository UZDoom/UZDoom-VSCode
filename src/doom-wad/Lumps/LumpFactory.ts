import Lump from "./Lump";
import Textmap from "./Textmap";

export default class LumpFactory
{
	private static classesByName: Record<string, typeof Lump> = {};

	static registerClassForName(name: string, constructor: typeof Lump)
	{
		LumpFactory.classesByName[name.toUpperCase()] = constructor;
	}

	static createFromName(name: string, index: number, content: ArrayBuffer)
	{
		let result: Lump;

		const trimmed = Lump.sanitizeName(name).toUpperCase();

		if(!(trimmed in LumpFactory.classesByName))
			result = new Lump(index, name, content);
		else
			result = new LumpFactory.classesByName[trimmed](index, name, content);

		result.name = name;

		return result;
	}
}

LumpFactory.registerClassForName("TEXTMAP", Textmap);
