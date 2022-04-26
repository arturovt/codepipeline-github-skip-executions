import 'source-map-support/register';
import { envsafe, str } from 'envsafe';
import * as globToRegExp from 'glob-to-regexp';
import * as CodePipeline from 'aws-sdk/clients/codepipeline';
import type { PushEvent } from '@octokit/webhooks-types';
import type { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2 } from 'aws-lambda';

const defaultWatchedFiles = 'this_is_a_string_that_will_allow_skipping_checks';

const environment = envsafe({
  AWS_REGION: str(),
  PIPELINE_NAME: str(),
  GITHUB_BRANCH: str(),
  WATCHED_FILES: str({ default: defaultWatchedFiles }),
});

const enum ResponseMessage {
  Pong = 'Pong',
  SkippingCI = 'Skipping CI',
}

export const triggerPipeline: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2,
) => {
  const githubEvent = event.headers['x-github-event'];

  if (githubEvent !== 'push' || !event.body) {
    return ResponseMessage.Pong;
  }

  const { ref, head_commit } = <PushEvent>JSON.parse(event.body);

  if (
    ref !== `refs/heads/${environment.GITHUB_BRANCH}` ||
    head_commit === null ||
    head_commit.message.includes('[skip ci]')
  ) {
    return ResponseMessage.SkippingCI;
  }

  // If the `process.env.WATCHED_FILES` is provided and it equals something like `src/**/*.ts`.
  if (environment.WATCHED_FILES !== defaultWatchedFiles) {
    const re = globToRegExp(environment.WATCHED_FILES, { extended: true });

    const files: string[] = [
      ...head_commit.added,
      ...head_commit.removed,
      ...head_commit.modified,
    ].filter(file =>
      // Let's go through all files, that have been updated, and find any file that matches the glob pattern.
      re.test(file),
    );

    if (files.length === 0) {
      return ResponseMessage.SkippingCI;
    }
  }

  const codepipeline = new CodePipeline({ region: environment.AWS_REGION });
  const { pipelineExecutionId } = await codepipeline
    .startPipelineExecution({ name: environment.PIPELINE_NAME })
    .promise();
  return pipelineExecutionId!;
};
