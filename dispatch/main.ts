import core from "@actions/core";
import github from "@actions/github";

async function run(): Promise<void> {
	try {
		const token = core.getInput("token");
		const org = core.getInput("org");
		const repo = core.getInput("repo");
		const branch = core.getInput("branch");
		const docs_path = core.getInput("docs_path");
		const pkg_path = core.getInput("pkg_path");
		const project_name = core.getInput("project_name");

		console.log(token.length);

		const octokit = github.getOctokit(token);

		const dispatchResp = await octokit.rest.actions.createWorkflowDispatch({
			owner: org,
			repo: "sites",
			workflow_id: "docs-deploy-trigger.yml",
			ref: "master",
			inputs: {
				org,
				repo,
				branch,
				docs_path,
				pkg_path,
				project_name,
			},
		});
		core.info(`API response status: ${dispatchResp.status} 🚀`);
	} catch (error) {
		core.setFailed(error.message);
	}
}

run();
