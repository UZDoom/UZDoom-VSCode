import Tokenizr from "tokenizr";
import Lump from "./Lump";
import ParseTextmapError from "../Exceptions/ParseTextmapError";

// NB: See https://github.com/UZDoom/uzdoom/blob/master/specs/udmf.txt

type BooleanToken = {
	type: "boolean";
	value: boolean;
}

type IdentifierToken = {
	type: "identifier",
	value: string;
}

type NumericToken = {
	type: "integer" | "float";
	value: number;
}

type StringToken = {
	type: "string";
	value: string;
}

type AssignmentToken = {
	type: "assignment";
	value: "=";
}

type OpenBraceToken = {
	type: "open-brace";
	value: "{";
}

type CloseBraceToken = {
	type: "close-brace";
	value: "}";
}

type EndStatementToken = {
	type: "end-statement";
	value: ";";
}

type CharacterToken = {
	type: "char";
	value: string;
}

type EofToken = {
	type: "EOF";
	value: any;
}

type Token = BooleanToken | IdentifierToken | NumericToken | StringToken | AssignmentToken | OpenBraceToken | CloseBraceToken | EndStatementToken | CharacterToken | EofToken;

interface AssignmentExpression
{
	name: string;
	value: boolean | number | string;
}

type Properties = Record<string, boolean | number | string>;

type BlockType = "thing" | "vertex" | "linedef" | "sidedef" | "sector";

interface Block
{
	type: BlockType;
	properties: Properties;
}

export default class Textmap extends Lump
{
	namespace?: string;
	blocks: Block[] = [];

	private tokenize(string: string)
	{
		const lexer = new Tokenizr();

		lexer.rule(/true|false/, (ctx, match) => {
			ctx.accept("boolean", match[0] === "true");
		});

		lexer.rule(/[a-zA-Z_][a-zA-Z0-9_]*/, (ctx, match) => {
			ctx.accept("identifier")
		});

		lexer.rule(/[+-]?[0-9]*\.[0-9]*([eE][+-]?[0-9]+)?/, (ctx, match) => {
			ctx.accept("float", parseFloat(match[0]))
		});

		[/[+-]?[0-9]+/, /0[0-9]+/, /0x[0-9A-Fa-f]+/].forEach(regex =>
			lexer.rule(regex, (ctx, match) => {
				ctx.accept("integer", parseInt(match[0]))
			})
		);

		lexer.rule(/"((?:\\"|[^\r\n])*)"/, (ctx, match) => {
			ctx.accept("string", match[1].replace(/\\"/g, "\""))
		});

		lexer.rule(/\/\/[^\r\n]*\r?\n/, (ctx, match) => {
			ctx.ignore();
		});

		lexer.rule(/[ \t\r\n]+/, (ctx, match) => {
			ctx.ignore();
		})

		lexer.rule(/=/, (ctx, match) => {
			ctx.accept("assignment");
		});

		lexer.rule(/;/, (ctx, match) => {
			ctx.accept("end-statement");
		});

		lexer.rule(/{/, (ctx, match) => {
			ctx.accept("open-brace");
		});

		lexer.rule(/}/, (ctx, match) => {
			ctx.accept("close-brace");
		});

		lexer.rule(/./, (ctx, match) => {
			ctx.accept("char")
		})

		lexer.input(string);

		return lexer.tokens();
	}

	private parseAssignment(next: () => Token): AssignmentExpression
	{
		const name = next();

		if(name.type !== "identifier")
			throw new ParseTextmapError("Expected assignment expression to begin with an identifier");

		const equals = next();

		if(equals.type !== "assignment")
			throw new ParseTextmapError("Expected assignment operator to follow identifier");

		const value = next();
		const end = next();

		if(end.type !== "end-statement")
			throw new ParseTextmapError("Expected end statement after assignment value");

		return {
			name: name.value,
			value: value.value
		};
	}

	private parseBlock(next: () => Token, peek: () => Token): Block
	{
		const first = next();

		if(first.type !== "identifier")
			throw new ParseTextmapError("Expected block identifier");

		const type = first.value;

		switch(type)
		{
			case "thing":
			case "vertex":
			case "linedef":
			case "sidedef":
			case "sector":
				break;

			default:
				throw new ParseTextmapError("Invalid block type");
		}

		const open = next();

		if(open.type !== "open-brace")
			throw new ParseTextmapError("Expected open brace");

		const properties: Properties = {};

		while(peek().type !== "close-brace")
		{
			const expression = this.parseAssignment(next);
			properties[expression.name] = expression.value;
		}

		const closed = next();

		if(closed.type !== "close-brace")
			throw new ParseTextmapError("Expected close brace");

		return {
			type,
			properties
		};
	}

	private parse(tokens: Token[])
	{
		if(tokens.length === 0)
			throw new ParseTextmapError("Expected one or more tokens");

		let cursor = 0;

		const peek = () => {
			if(cursor >= tokens.length)
				throw new ParseTextmapError("Unexpected end of tokens");
			return tokens[cursor];
		};

		const next = () => {
			const result = peek();
			cursor++;
			return result;
		};

		const first = tokens[0];

		if(first.type === "identifier" && first.value === "namespace")
			this.namespace = this.parseAssignment(next).value.toString();

		while(cursor < tokens.length && peek().type !== "EOF")
			this.blocks.push( this.parseBlock(next, peek) );
	}

	set content(buffer: ArrayBuffer)
	{
		delete this.namespace;
		this.blocks = [];

		super.content = buffer;

		const string = new TextDecoder().decode(buffer);
		const tokens = this.tokenize(string);

		this.parse(tokens as Token[]);
	}

	get content(): ArrayBuffer
	{
		const lines: string[] = [];
		const escape = (string: string) => string.replace("\"", "\\\"");

		if(this.namespace)
			lines.push(`namespace = "${escape(this.namespace)}";`);

		this.blocks.forEach(block => {

			lines.push(block.type);
			lines.push("{");

			for(const key in block.properties)
			{
				const value = block.properties[key];
				let stringified;

				if(value === true)
					stringified = "true";
				else if(value === false)
					stringified = "false";
				else if(typeof value === "number")
					stringified = value.toString();
				else if(typeof value === "string")
					stringified = `"${escape(value)}"`;

				lines.push(`${key} = ${stringified};`);
			}

			lines.push("}");

		});

		return new TextEncoder().encode(lines.join("\n")).buffer;
	}
}
