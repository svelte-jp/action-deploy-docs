import core from "@actions/core";
import exec from "@actions/exec";
import fs from "fs";
import path from "path";
import { put } from "httpie";

import { get_docs, DocFiles } from "./fs";
import { transform_cloudflare, transform_docs } from "./transform";

const CF_ACC_ID = core.getInput("cf_acc_id");
const CF_NS_ID = core.getInput("cf_ns_id");

const API_ROOT = "https://api.cloudflare.com/client/v4/";
const KV_WRITE = `accounts/${CF_ACC_ID}/storage/kv/namespaces/${CF_NS_ID}/bulk`;

async function get_repo(
	target_org: string,
	target_repo: string,
	target_branch: string,
	docs_path: string,
	pkg_path: string
): Promise<void> {
	const tmp_dir_name = `__tmp_repo_path`;

	// we want to clone the necessary branch and only that branch
	// but we don't want files because we want to sparsely checkout the branch later
	// we also don't want any history, we only care about files
	// this is basically magic
	await exec.exec("git", [
		"clone",
		`https://github.com/${target_org}/${target_repo}.git`,
		"--no-checkout",
		"--branch",
		target_branch,
		"--single-branch",
		tmp_dir_name,
		"--depth",
		"1",
		"--verbose",
	]);

	process.chdir(tmp_dir_name);

	await exec.exec("git", ["sparse-checkout", "init"]);

	// we only care about the documentation folder and any package readmes + package.jsons
	fs.writeFileSync(
		path.join(process.cwd(), ".git/info/sparse-checkout"),
		`/${docs_path}/\n/${pkg_path}/*/README.md\n/${pkg_path}/*/package.json\n/README.md\n/package.json`
	);

	await exec.exec("git", ["sparse-checkout", "reapply"]);
	await exec.exec("git", ["switch", target_branch]);
}

async function run() {
	const target_org = core.getInput("org");
	const target_repo = core.getInput("repo");
	const target_branch = core.getInput("branch");
	const CF_TOKEN = core.getInput("cf_token");
	const docs_path = core.getInput("docs_path");
	const pkg_path = core.getInput("pkg_path");
	const project_name = core.getInput("project_name");

	if (target_branch !== "main" && target_branch !== "master") {
		core.setFailed("Branch deploys are not yet supported.");
	}

	try {
		await get_repo(target_org, target_repo, target_branch, docs_path, pkg_path);
	} catch (e) {
		core.warning(e.message);
		core.setFailed(
			`Failed to clone repository: https://github.com/${target_org}/${target_repo}.git#${target_branch}`
		);
	}

	let docs: [string, DocFiles][] | false;

	try {
		docs = await get_docs(target_repo, pkg_path, docs_path);
	} catch (e) {
		core.warning(e.message);
		core.setFailed("Failed to read documentation files.");
		throw new Error("no docs");
	}

	const transformed_docs = await Promise.all(
		docs.map(([project, docs]) =>
			// @ts-ignore
			transform_docs(docs, project_name || project)
		)
	);

	const ready_for_cf = transformed_docs
		.map((d) =>
			d.map(({ content, project, type }) =>
				//@ts-ignore
				transform_cloudflare(content, { project, type, keyby: "slug" })
			)
		)
		.flat(2);

	const is_valid = ready_for_cf.every(
		({ value, key }) => typeof value === "string" && typeof key === "string"
	);

	console.log(is_valid ? "\nEVERYTHING IS VALID\n" : "\nTHIS IS NOT VALID\n");

	try {
		const x = await put(`${API_ROOT}${KV_WRITE}`, {
			body: ready_for_cf,
			headers: {
				Authorization: `Bearer ${CF_TOKEN}`,
			},
		});
		console.log("put: ", x);
	} catch (e) {
		console.error(JSON.stringify(e.data));
		console.log("it didn't work", e.message, e.code, e.stack);
		core.setFailed("Something went wrong: " + e.message);
		// throw e;
	}
}

run();
