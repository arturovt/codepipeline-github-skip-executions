import { Octokit } from '@octokit/core';
import * as response from 'cfn-response';
import * as SSM from 'aws-sdk/clients/ssm';
import { envsafe, str, url } from 'envsafe';
import * as SecretsManager from 'aws-sdk/clients/secretsmanager';
import type { CloudFormationCustomResourceHandler } from 'aws-lambda';

const environment = envsafe({
  AWS_REGION: str(),
  GITHUB_USER: str(),
  WEBHOOK_URL: url(),
  GITHUB_REPOSITORY: str(),
  SSM_HOOK_ID_PARAMETER_NAME: str(),
});

export const setupWebhook: CloudFormationCustomResourceHandler = async (
  event,
  context,
  callback,
): Promise<void> => {
  if (event.RequestType === 'Update') {
    response.send(event, context, response.SUCCESS);
    return callback(null);
  }

  try {
    const secretsmanager = new SecretsManager({ region: environment.AWS_REGION });
    const output = await secretsmanager
      .getSecretValue({ SecretId: 'GithubOAuthToken' })
      .promise();

    const ssm = new SSM({ region: environment.AWS_REGION });
    const octokit = new Octokit({ auth: JSON.parse(output.SecretString!).GithubOAuthToken });

    if (event.RequestType === 'Create') {
      await createWebhook(ssm, octokit);
    } else {
      await deleteWebhookIfParameterExists(ssm, octokit);
    }

    response.send(event, context, response.SUCCESS);
    callback(null);
  } catch (error) {
    response.send(event, context, response.FAILED);
    callback(error);
  }
};

async function createWebhook(ssm: SSM, octokit: Octokit): Promise<void> {
  const { data } = await octokit.request('POST /repos/{owner}/{repo}/hooks', {
    owner: environment.GITHUB_USER,
    repo: environment.GITHUB_REPOSITORY,
    active: true,
    events: ['push'],
    config: {
      insecure_ssl: '0',
      content_type: 'json',
      url: environment.WEBHOOK_URL,
    },
  });

  await ssm
    .putParameter({
      Type: 'String',
      Name: environment.SSM_HOOK_ID_PARAMETER_NAME,
      Value: data.id.toString(),
    })
    .promise();
}

async function deleteWebhookIfParameterExists(ssm: SSM, octokit: Octokit): Promise<void> {
  try {
    const { Parameter } = await ssm
      .getParameter({ Name: environment.SSM_HOOK_ID_PARAMETER_NAME })
      .promise();

    if (Parameter?.Value) {
      await deleteWebhook(ssm, octokit, Parameter.Value);
    }
  } catch (error) {
    // The parameter may not exist if it failed to be created.
    // The CloudFormation will be stuck in an infinite loop by triggering that lambda repeatedly.
    if (error.code !== 'ParameterNotFound') {
      throw error;
    }
  }
}

async function deleteWebhook(ssm: SSM, octokit: Octokit, hookId: string): Promise<void> {
  await Promise.all([
    octokit.request('DELETE /repos/{owner}/{repo}/hooks/{hook_id}', {
      owner: environment.GITHUB_USER,
      repo: environment.GITHUB_REPOSITORY,
      hook_id: Number(hookId),
    }),
    ssm.deleteParameter({ Name: environment.SSM_HOOK_ID_PARAMETER_NAME }).promise(),
  ]);
}
