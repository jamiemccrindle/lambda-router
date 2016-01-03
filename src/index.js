import './babel.js';

import { updateCloudformation } from './deploy';
import { run } from './server';
import yargs from 'yargs';
import { newLogger } from './logging';
import os from 'os';
import cluster from 'cluster'

let logger = newLogger(console).withContext(os.hostname());

try {

  let _ = yargs
    .usage('$0 command')
    .command('server', 'server', function (yargs, argv) {
      argv = yargs
        .alias('t', 'DynamoTable')
        .alias('m', 'MaxBody')
        .demand(['t'])
        .option('p', {
          alias: 'Port',
          demand: false,
          default: 3000,
          describe: 'Port',
          type: 'number'
        })
        .option('c', {
          alias: 'ClusterProcesses',
          demand: false,
          default: os.cpus().length,
          describe: 'Cluster Processes',
          type: 'number'
        })
        .help('help')
        .argv;

      if (cluster.isMaster) {
        // Fork workers.
        for (var i = 0; i < argv.ClusterProcesses; i++) {
          cluster.fork();
        }
        cluster.on('exit', function (worker, code, signal) {
          console.log('worker ' + worker.process.pid + ' died');
        });
      } else {
        run(logger, argv)
          .catch(function (error) {
            console.error(error);
          });
      }

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

      await updateCloudformation(logger, argv)
        .catch(function (error) {
          console.error(error);
        });

    })
    .demand(1, 'must provide a valid command')
    .help('help')
    .argv;

} catch (error) {
  console.log(error.stack);
}
