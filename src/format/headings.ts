import type { Transformer } from "unified";
import type { Parent } from "unist";
import type { Heading } from "mdast";
import { custom_vfile } from "./types";

import tree_to_string from "mdast-util-to-string";
import to_hast from "mdast-util-to-hast";
import visit from "unist-util-visit";

import { make_session_slug_processor } from "./slug";

export const SLUG_PRESERVE_UNICODE = false;
export const SLUG_SEPARATOR = "-";

const make_slug = make_session_slug_processor({
	preserve_unicode: SLUG_PRESERVE_UNICODE,
	separator: SLUG_SEPARATOR,
});

export function validate_headings(): Transformer {
	return function transformer(tree) {
		visit(tree, "heading", (node: Heading) => {
			if (node.depth < 3 || node.depth > 5)
				throw new Error(
					`Only level 3, 4, and 5 headings are allowed. Got level ${node.depth} heading.`
				);
		});
	};
}

type Heading_with_hProps = Heading & {
	data: {
		hProperties?: Record<string, unknown>;
		hChildren?: unknown[];
	};
};

export function headings(): Transformer {
	return function (tree, { data }: custom_vfile) {
		visit(tree, "heading", (node: Heading_with_hProps) => {
			const prev_section = data.section_stack[data.section_stack.length - 1];

			if (node.depth < data.prev_level && data.slugs.length !== 0)
				for (let i = 0; i < data.prev_level - node.depth + 1; i++)
					data.slugs.pop();

			const title_text = tree_to_string(node);

			let slug = make_slug(
				node.depth === 3
					? [data.section_title, title_text].join(" ")
					: [data.slugs[data.slugs.length - 1], title_text].join(" "),
				data.seen_slugs
			);

			data.slugs.push(slug);

			if (node.depth > data.prev_level) {
				data.section_stack.push(
					prev_section[prev_section.length - 1].sections || []
				);
			} else if (node.depth < data.prev_level) {
				data.section_stack.pop();
			}

			data.section_stack[data.section_stack.length - 1].push({
				slug,
				title: title_text,
				sections: [],
			});
			data.prev_level = node.depth;

			const children = (to_hast(node) as Parent).children;

			if (!node.data) node.data = {};
			if (!node.data.hProperties) node.data.hProperties = {};
			if (!node.data.hChildren) node.data.hChildren = [];

			const span_node = {
				type: "element",
				tagName: "span",
				properties: { id: [slug], className: ["offset-anchor"] },
			};

			const a_node = {
				type: "element",
				tagName: "a",
				properties: {
					href: `${data.dir}#${slug}`,
					className: ["anchor"],
					"aria-hidden": true,
				},
			};

			//@ts-ignore
			if (node.depth > 4) span_node.properties["data-scrollignore"] = true;

			node.data.hChildren = [span_node, a_node];

			children.forEach((v) => node.data.hChildren.push(v));
		});
	};
}
