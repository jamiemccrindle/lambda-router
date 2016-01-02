require('../babel.js');

import { updateCloudformation } from './deploy';
import { run } from './server';
import yargs from 'yargs';

var _ = yargs
  .usage('$0 command')
  .command('server', 'server', async function (yargs, argv) {
    argv = yargs
      .alias('t', 'DynamoTable')
      .alias('m', 'MaxBody')
      .demand(['t'])
      .help('help')
      .argv;

    await run(argv)
      .catch(function (error) {
        console.error(error);
      });

  })
  .command('cloudformation', 'cloudformation', async function (yargs, argv) {
    argv = yargs
      .alias('s', 'StackName')
      .alias('k', 'KeyName')
      .alias('n', 'SubnetId')
      .alias('c', 'DesiredCapacity')
      .alias('m', 'MaxSize')
      .alias('i', 'InstanceType')
      .alias('l', 'SshLocation')
      .alias('e', 'NotificationEmail')
      .demand(['s', 'k', 'e'])
      .help('help')
      .argv;

    await updateCloudformation(argv)
      .catch(function (error) {
        console.error(error);
      });

  })
  .demand(1, 'must provide a valid command')
  .help('help')
  .argv;
