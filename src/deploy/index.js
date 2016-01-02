import { promisifyAll } from 'bluebird';
import * as AWS from 'aws-sdk'
import * as yargs from 'yargs';
import { inspect } from 'util';
import cf from './cloudformation';

export async function updateCloudformation(logger, args) {

  let cloudFormation = promisifyAll(new AWS.CloudFormation(), {suffix: 'Promised'});

  let stackName = args.StackName;

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
    await cloudFormation.describeStacksPromised({StackName: stackName});
  } catch (e) {
    if (e.code === 'ValidationError') {
      stackExists = false;
    } else {
      throw e;
    }
  }

  if (stackExists) {
    logger.info('updating stack', stackName);
    let result = await cloudFormation.updateStackPromised(params);
    logger.info('completed update', result);
  } else {
    logger.info('creating stack', stackName);
    let result = await cloudFormation.createStackPromised(params);
    logger.info('completed creation', result);
  }

}
