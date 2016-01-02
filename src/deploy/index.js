require('../babel.js');

import { promisifyAll } from 'bluebird';
import * as AWS from 'aws-sdk'
import * as yargs from 'yargs';
import { inspect } from 'util';
import cf from './cloudformation';

let cloudFormation = promisifyAll(new AWS.CloudFormation());

export async function updateCloudformation(args) {

  let cloudFormationTemplate = cf();

  let cloudFormationParams = Object.keys(cloudFormationTemplate.Parameters).reduce((acc, n) => {
    if (args[n]) {
      acc.push({
        ParameterKey: n,
        ParameterValue: args[n]
      })
    }
    return acc;
  }, []);

  let cloudFormationJson = JSON.stringify(cloudFormationTemplate);

  let params = {
    StackName: stackName,
    Capabilities: [
      'CAPABILITY_IAM'
    ],
    Parameters: cloudFormationParams,
    TemplateBody: cloudFormationJson
  };

  var stackExists = true;
  try {
    await cloudFormation.describeStacks({StackName: stackName});
  } catch (e) {
    if (e.code === 'ValidationError') {
      stackExists = false;
    } else {
      throw e;
    }
  }

  if (stackExists) {
    await cloudFormation.updateStack(params);
  } else {
    await cloudFormation.createStack(params);
  }

}
