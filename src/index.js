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
        .option('p', {
          alias: 'Port',
          demand: false,
          default: 3000,
          describe: 'Port',
          type: 'number'
        })
        .option('k', {
          alias: 'Debug',
          demand: false,
          default: false,
          describe: 'Debug',
          type: 'boolean'
        })
        .option('r', {
          alias: 'DynamoRefreshSeconds',
          demand: false,
          default: 60,
          describe: 'How many seconds between calls to dynamo to get fresh routes',
          type: 'number'
        })
        .option('l', {
          alias: 'Lambda',
          demand: false,
          describe: 'Send all requests to this lambda',
          type: 'string'
        })
        .option('c', {
          alias: 'ClusterProcesses',
          demand: false,
          default: os.cpus().length,
          describe: 'Cluster Processes',
          type: 'number'
        })
        .check(argv => {
          if(!argv.DynamoTable && !argv.Lambda) {
            throw new Error('Either DynamoTable or Lambda need to be set');
          }
          return true;
        })
        .help('help')
        .argv;

      if(argv.ClusterProcesses > 1) {
        if (cluster.isMaster) {
          // Fork workers.
          for (var i = 0; i < argv.ClusterProcesses; i++) {
            cluster.fork(process.env);
          }
          cluster.on('exit', function (worker, code, signal) {
            logger.log('worker ' + worker.process.pid + ' died');
          });
        } else {
          run(logger, argv)
            .catch(function (error) {
              logger.error(error.stack);
            });
        }
      } else {
        run(logger, argv)
          .catch(function (error) {
            logger.error(error.stack);
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
        .demand(['s', 'k', 'e', 'n'])
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
