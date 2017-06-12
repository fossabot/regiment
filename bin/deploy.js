#! /usr/bin/env node

const path = require('path');

/*
 * Using the ShellJS library, to provide portable Unix shell
 *   commands for Node.js. Read more at:
 *   http://shelljs.org
 */
var shell = require('shelljs');

/*
 * Check for the availability of required installations.
 */
if (!shell.which('aws')) {
  shell.echo('ERROR | This script requires the AWS CLI to be installed.');
  shell.exit(1);
}

/*
 * Check for the availability of required command line arguments.
 */
var arguments = {
  region: argumentRequired('--region'),                    // The AWS Region argument
  profile: argumentRequired('--profile'),                  // The AWS Profile argument
  bucketName: argumentRequired('--bucket-name'),           // The AWS S3 Bucket name argument
  stackName: argumentRequired('--stack-name'),             // The CloudFormation stack name argument
  parametersFile: argumentRequired('--parameters-file')    // The CloudFormation parameters file argument
};

/*
 * Read the parameters from the parametersFile.
 */
var parametersString = '';
try {
  var parametersFilePath = path.join(process.cwd(), arguments.parametersFile);
  console.log('INFO | Reading parameters file from ' + parametersFilePath);
  var parameters = require(parametersFilePath);
  if (parameters.length > 0) {
    parametersString += '--parameter-overrides ';
    for (var i = 0, len = parameters.length; i < len; i++) {
      parametersString += (parameters[i].ParameterKey + "=" + parameters[i].ParameterValue + " ");
    }
  }
}
catch(e) {
  shell.echo(e);
  shell.echo('ERROR | Unable to read the parameters from the --parameters-file named ' + parametersFile);
  shell.exit(1);
}

/*
 * Define the deployment commands.
 */

/*
 * We always use the same 'aws s3 mb' command to attempt to create the 
 * bucket, even if it already exists.
 * 
 * 'BucketAlreadyOwnedByYou' errors will only be returned outside of the 
 * US Standard region (us-east-1). Inside the US Standard region (i.e. 
 * when you don't specify a location constraint), attempting to recreate 
 * a bucket you already own will succeed.
 * Source http://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html
 */
var bucketCommand = 'aws s3 mb s3://' + arguments.bucketName + ' --region us-east-1 --profile ' + arguments.profile;

var packageCommand = 'aws cloudformation package --template-file ./cloudformation.yaml --s3-bucket ' + arguments.bucketName + ' --output-template-file packaged-cloudformation.yaml --region ' + arguments.region + ' --profile ' + arguments.profile;
var deployCommand = 'aws cloudformation deploy --template-file ./packaged-cloudformation.yaml --stack-name ' + arguments.stackName + ' --capabilities CAPABILITY_NAMED_IAM ' + parametersString + ' --region ' + arguments.region + ' --profile ' + arguments.profile;

/*
 * Run the deployment steps by executing the commands.
 */
shell.echo('=============================================================== [START]');

// Create the staging area for CloudFormation packaging of artifacts
if (shell.exec(bucketCommand).code !== 0) {
  shell.echo('ERROR | CloudFormation staging area S3 bucket creation failed.');
  shell.exit(1);
}

// Resolve references in the CloudFormation template by packaging and uploading the packaged template to S3
if (shell.exec(packageCommand).code !== 0) {
  shell.echo('ERROR | CloudFormation package failed.');
  shell.exit(1);
}

// Deploy the CloudFormation infrastructure
var deployCommand = shell.exec(deployCommand);
if (deployCommand.code !== 0) {
  if (deployCommand.code == 255 && deployCommand.stderr.indexOf('No changes to deploy. Stack ' + arguments.stackName + ' is up to date') > -1) {
    // Ignore (not a real CloudFormation error, currently an open GitHub issue for the AWS CloudFormation API)
  } else {
    shell.echo('ERROR | CloudFormation deploy failed.');
    shell.exit(1);
  }
}

shell.echo('=============================================================== [END]');

/*
 * Define the private script convenience functions.
 */
function argumentRequired (name) {
  if (process.argv.indexOf(name) == -1) {
    shell.echo('ERROR | This script requires the ' + name + ' argument.');
    shell.exit(1);
  }
  return process.argv[process.argv.indexOf(name) + 1];
}
