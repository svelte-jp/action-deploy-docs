import slugify from "@sindresorhus/slugify";

export const SLUG_PRESERVE_UNICODE = false;
export const SLUG_SEPARATOR = "_";

interface ProcessorOptions {
	separator: string;
}

interface Chunk {
	type: "pass" | "process";
	string: string;
}

interface ProcessedParts {
	chunks: Chunk[];
	current: Chunk;
}

export function url_safe_processor(
	url: string,
	opts?: ProcessorOptions
): string {
	const { separator = SLUG_SEPARATOR } = opts || {};

	return slugify(url, {
		customReplacements: [
			// runs before any other transformations
			["$", "DOLLAR"], // `$destroy` & co
			["-", "DASH"], // conflicts with `separator`
		],
		separator,
		decamelize: false,
		lowercase: false,
	})
		.replace(/DOLLAR/g, "$")
		.replace(/DASH/g, "-");
}

const alphaNumRegex = /[a-zA-Z0-9]/;
const unicodeRegex = /\p{Letter}/u;

const isNonAlphaNumUnicode = (string: string) =>
	!alphaNumRegex.test(string) && unicodeRegex.test(string);

export function unicode_safe_processor(
	url: string,
	opts?: ProcessorOptions
): string {
	const { separator = SLUG_SEPARATOR } = opts || {};

	return url
		.split("")
		.reduce(
			(accum, char, index, array) => {
				const type = isNonAlphaNumUnicode(char) ? "pass" : "process";

				if (index === 0) {
					accum.current = { type, string: char };
				} else if (type === accum.current.type) {
					accum.current.string += char;
				} else {
					accum.chunks.push(accum.current);
					accum.current = { type, string: char };
				}

				if (index === array.length - 1) {
					accum.chunks.push(accum.current);
				}
				console.log(accum);
				return accum;
			},
			{ chunks: [], current: { type: "process", string: "" } } as ProcessedParts
		)
		.chunks.reduce((accum, chunk) => {
			const processed =
				chunk.type === "process"
					? url_safe_processor(chunk.string)
					: chunk.string;

			processed.length > 0 && accum.push(processed);

			return accum;
		}, [] as string[])
		.join(separator);
}

export function make_session_slug_processor({
	preserve_unicode = SLUG_PRESERVE_UNICODE,
	separator = SLUG_SEPARATOR,
}) {
	const processor = preserve_unicode
		? unicode_safe_processor
		: url_safe_processor;
	const seen = new Set();

	return function (url: string) {
		const slug = processor(url, { separator });

		if (seen.has(slug)) throw new Error(`Duplicate slug ${slug}`);
		seen.add(slug);

		return slug;
	};
}
