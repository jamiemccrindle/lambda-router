import { promisifyAll } from 'bluebird';
import * as AWS from 'aws-sdk';
import koa from 'koa';
import pathToRegexp from 'path-to-regexp';
import bodyParser from 'koa-bodyparser';

async function getRoutes(dynamoDbDoc, tableName) {
  var params = {
    TableName: tableName,
    FilterExpression: "Enabled = :enabled",
    ExpressionAttributeValues: {
      ":enabled": true
    }
  };
  let data = await dynamoDbDoc.scanPromised(params);
  let result = [];
  for(let item of data.Items) {
    result.push(item);
  }
  return result;
}

function matchMethod(methods, requestMethod) {
  if(methods) {
    for (let method of methods.values) {
      if (method === '*' || requestMethod === method) {
        return true;
      }
    }
  }
  return false;
}

function matchHost(hosts, requestHost) {
  if(hosts) {
    for (let host of hosts.values) {
      if (host === '*' || requestHost === method) {
        return true;
      }
    }
  }
  return false;
}

function matchPath(path, requestPath) {
  let keys = {};
  let re = pathToRegexp(path, keys)
  return {matched: re.exec(requestPath) != null, keys: keys};
}

function match(routes, request) {
  for (let route of routes) {
    if (matchMethod(route['MatchMethods'], request.method)
      && matchHost(route['MatchHosts'], request.host)) {
      let pathMatch = matchPath(route['MatchPath'], request.path);
      if (pathMatch.matched) {
        return route;
      }
    }
  }
  // no route matched
  return null;
}

export async function run(logger, args) {

  let dynamoDbDoc = promisifyAll(new AWS.DynamoDB.DocumentClient(), {suffix: 'Promised'});
  let lambda = promisifyAll(new AWS.Lambda(), {suffix: 'Promised'});

  var routes = await getRoutes(dynamoDbDoc, args.DynamoTable);
  logger.info(routes);

  let app = koa();
  app.use(bodyParser());
  app.proxy = true;

  app.use(function *() {
    logger.info(this.request.path);
    if (this.request.method === 'GET' && this.request.path === '/status') {
      this.body = 'OK';
      return;
    } else {
      let route = match(routes, this.request);
      if (!route) {
        this.throw(404, 'Not Found')
      }
      let payload = {
        method: this.request.method,
        headers: this.request.headers,
        body: this.request.body,
        url: this.request.url,
        ip: this.request.ip
      }

      let params = {
        FunctionName: route['LambdaFunctionName'],
        InvocationType: route['LambdaInvocationType'],
        LogType: route['LambdaLogType'],
        Payload: JSON.stringify(payload)
      };

      if(route['LambdaQualifier']) {
        params.LambdaQualifier = route['LambdaQualifier'];
      }
      let lambdaResponse = yield lambda.invokePromised(params);
      if (lambdaResponse.FunctionError) {
        this.throw(500, lambdaResponse.LogResult || 'Error');
        return;
      }
      switch (route['LambdaInvocationType']) {
        case 'Event':
          this.status = 200;
          break;
        case 'RequestResponse':
          let responsePayload = JSON.parse(lambdaResponse.Payload);
          this.set(responsePayload.headers || {});
          this.status = responsePayload.status || 200;
          if(responsePayload.body) {
            this.body = new Buffer(responsePayload.body, 'base64');
          }
          return;
        case 'DryRun':
          this.status = 200;
          return;
        default:
          this.throw(500, 'Unexpected type')
      }
    }
  });
  app.listen(args.Port);
  logger.info(`listening on http://localhost:${args.Port}`)
}