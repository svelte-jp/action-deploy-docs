import { promises as fs } from "fs";
import * as path from "path";

import { increment_headings } from "../format/increment_headings";

export interface BaseDocs {
	docs: [string, string][];
}

const fs_opts = {
	encoding: "utf-8",
} as const;

function get_content_and_filename(
	base: string,
	filename: string
): Promise<[string, string]> {
	console.log(filename, filename.replace(/^@sveltejs\//, ""));
	console.log("\n");
	return new Promise(async (rs, rj) => {
		try {
			const content = await fs.readFile(path.join(base, filename), fs_opts);
			rs([filename, content]);
		} catch (e) {
			rj(e);
		}
	});
}

async function maybe_read_dir(
	docs_dir: string
): Promise<Array<string> | false> {
	try {
		return await fs.readdir(docs_dir);
	} catch (e) {
		return false;
	}
}

// async function maybe_read_file(docs_dir: string): Promise<string | false> {
// 	try {
// 		return (await fs.readFile(path.join(docs_dir, "docs"))).toString();
// 	} catch (e) {
// 		return false;
// 	}
// }

type File = {
	content: string | File[];
	name: string;
	is_dir: boolean;
};

export async function rc_read_file(file_path: string): Promise<File> {
	let file_or_dir: File = {
		name: file_path.split("/").pop(),
		is_dir: false,
		content: "",
	};
	try {
		file_or_dir.content = await (await fs.readFile(file_path)).toString();
	} catch (e) {
		file_or_dir.is_dir = true;
		file_or_dir.content = await Promise.all(
			(await fs.readdir(file_path))
				.filter((name) => !name.endsWith("DS_Store"))
				.map((name) => rc_read_file(path.join(file_path, name)))
		);
	}

	return file_or_dir;
}

// base_docs
//   docs else base_readme
//   faq
//   migrating
//   blog
//   tutorials
//   examples

interface Docs {
	docs?: unknown;
	faq?: unknown;
	migrating?: unknown;
	blog?: unknown;
	tutorials?: unknown;
	examples?: unknown;
}

type transformed_docs = [string, Docs][];

type doc_types =
	| "docs"
	| "faq"
	| "migrating"
	| "blog"
	| "tutorials"
	| "examples";

const doc_types = ["docs", "faq", "migrating", "blog", "tutorials", "examples"];

const transformers = {
	docs(name: string, content: File[]) {
		return content.map(({ name, content }) => ({ name, content }));
	},
	faq(name: string, content: File[]) {
		return this.docs(name, content);
	},
	migrating(name: string, content: File[]) {
		return this.docs(name, content);
	},
	blog(name: string, content: File[]) {
		return this.docs(name, content);
	},
	tutorials(): "undefined" {
		return "undefined";
	},
	examples(): "undefined" {
		return "undefined";
	},
};

interface SimpleFile {
	name: string;
	content: SimpleFile[] | string;
}

function strip_meta(name: string, content: string | File[]): SimpleFile {
	return {
		name: name,
		content: Array.isArray(content)
			? content.map((v) => strip_meta(v.name, v.content))
			: content,
	};
}

// declare global {
//   interface ReadonlyArray<T> {
//     includes<U>(x: U & ((T & U) extends never ? never : unknown)): boolean;
//   }
// }

export function transform_files(
	file: File,
	pkg_path: string,
	docs_path: string,
	project: string
): transformed_docs {
	const base_docs: Docs = {};
	const pkgs: transformed_docs = [];

	if (file.is_dir && Array.isArray(file.content)) {
		file.content.forEach(({ name, content }) => {
			if (name === docs_path && Array.isArray(content)) {
				// console.log(name);

				content.forEach((docs) => {
					if (!doc_types.includes(docs.name) || !Array.isArray(docs.content))
						return;

					base_docs[docs.name as doc_types] = docs.content.map((entry) =>
						strip_meta(entry.name, entry.content as File[])
					);
				});
			}
			if (name === pkg_path) {
			} // do pkg stuff{}
		});
	}

	pkgs.push([project, base_docs]);

	return pkgs;
}

export async function get_base_documentation(
	docs_path: string,
	working_directory: string = process.cwd()
): Promise<BaseDocs | false> {
	const docs_dir = path.join(working_directory, docs_path);
	let api_content;

	const types = await rc_read_file(docs_dir);

	let api = await maybe_read_dir(path.join(docs_dir, "docs"));

	if (api) {
		api_content = await Promise.all(
			api
				.filter((f) => path.extname(f) === ".md" && !f.startsWith("xx"))
				.map((f) => get_content_and_filename(path.join(docs_dir, "docs"), f))
		);
	} else {
		console.log(working_directory);
		const content = await get_pkg_and_readme(working_directory, "");
		if (content) api_content = [content];
	}

	if (!api_content) return false;

	return {
		docs: api_content,
	};
}

function get_pkg_and_readme(
	base: string,
	pkg_dir: string
): Promise<[string, string] | false> {
	return new Promise(async (rs, rj) => {
		try {
			const [pkg, docs] = await Promise.all([
				fs.readFile(path.join(base, pkg_dir, "package.json"), fs_opts),
				fs.readFile(path.join(base, pkg_dir, "README.md"), fs_opts),
			]);

			const { name, private: _private } = JSON.parse(pkg);
			if (_private) throw new Error("This is a private package");
			console.log("PACKAGES READ");
			console.log(docs, "\n", increment_headings(docs));

			rs([name.replace(/^@sveltejs\//, ""), increment_headings(docs)]);
		} catch (e) {
			// console.error(e.message);
			rs(false);
		}
	});
}

interface PackageOptions {
	ignore: string[];
}

export async function get_package_documentation(
	pkg_path: string,
	working_directory: string = process.cwd(),
	opts: PackageOptions = { ignore: [] }
): Promise<[string, string][] | false> {
	const _ignore = opts.ignore.concat(
		opts.ignore.map((pkg) => `@sveltejs/${pkg}`)
	);
	const pkg_dir = path.join(working_directory, pkg_path);

	const packages = await maybe_read_dir(pkg_dir);

	if (!packages) return false;

	return (
		await Promise.all(packages.map((f) => get_pkg_and_readme(pkg_dir, f)))
	).filter((contents) => contents && !_ignore.includes(contents[0])) as [
		string,
		string
	][];
}
