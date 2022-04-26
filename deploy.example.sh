#!/bin/bash -x

s3Bucket="Some deployment bucket for CodePipeline and Serverless"

githubUser="GitHub username"
githubRepository="GitHub repository"
githubBranch="main"

if ! aws cloudformation describe-stacks --stack-name codepipeline; then
  stackId=$(aws cloudformation create-stack \
    --stack-name codepipeline \
    --template-body file://cloudformation/codepipeline.stack.yml \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameters \
      ParameterKey=S3Bucket,ParameterValue=$s3Bucket \
      ParameterKey=GithubOwner,ParameterValue=$githubUser \
      ParameterKey=GithubRepo,ParameterValue=$githubRepository \
      ParameterKey=GithubBranch,ParameterValue=$githubBranch \
    --query "StackId" \
    --output text)

  aws cloudformation wait stack-create-complete --stack-name $stackId
fi

pipelineName=$(aws cloudformation describe-stacks \
  --stack-name codepipeline \
  --query "Stacks[0].Outputs[?OutputKey == 'CodePipelineName'].OutputValue" \
  --output text)

region=$(aws configure get region)
ssmHookIdParameterName="/github/hook_id"

yarn sls deploy \
  --region $region \
  --param "s3Bucket=$s3Bucket" \
  --param "pipelineName=$pipelineName" \
  --param "githubBranch=$githubBranch" \
  --param "githubUser=$githubUser" \
  --param "githubRepository=$githubRepository" \
  --param "ssmHookIdParameterName=$ssmHookIdParameterName" \
  --param "watchedFiles=src/**/*.{js,ts}"
