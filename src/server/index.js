import { promisifyAll } from 'bluebird';
import * as AWS from 'aws-sdk';
import koa from 'koa';
import pathToRegexp from 'path-to-regexp';
import parse from 'co-body';

async function getRoutes(dynamoDbDoc, tableName) {
  var params = {
    TableName: tableName,
    FilterExpression: "enabled = :enabled",
    ExpressionAttributeValues: {
      ":enabled": true
    }
  };
  let data = await dynamoDbDoc.query(params);
  return data.Items;
}

function matchMethod(methods, requestMethod) {
  for (let method in methods) {
    if (method === '*' || requestMethod === method) {
      return true;
    }
  }
  return false;
}

function matchHost(hosts, requestHost) {
  for (let host in hosts) {
    if (host === '*' || requestHost === method) {
      return true;
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

async function run(args) {

  let dynamoDbDoc = promisifyAll(new AWS.DynamoDB.DocumentClient());
  let lambda = promisifyAll(new AWS.Lambda());

  var routes = getRoutes(dynamoDbDoc, args.DynamoTable);

  let app = koa();
  app.proxy = true;

  app.use(function *() {
    if (this.request.method === 'GET' && this.request.path === '/status') {
      this.body = 'OK';
    } else {
      let route = match(routes, this.request);
      if (!route) {
        this.throw(404, 'Not Found')
      }
      var body = yield parse(this, {limit: args.MaxBody || '100kb'});

      let payload = {
        method: this.request.method,
        headers: this.request.headers,
        body: body,
        url: this.request.url,
        ip: this.request.ip
      }

      let params = {
        FunctionName: route['LambdaFunctionName'],
        InvocationType: route['LambdaInvocationType'],
        LogType: route['LambdaLogType'],
        Payload: JSON.stringify(payload),
        Qualifier: route['LambdaQualifier']
      };
      let lambdaResponse = yield lambda.invoke(params);
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
          this.body = new Buffer(response.body, 'base64');
          return;
        case 'DryRun':
          this.status = 200;
          return;
        default:
          this.throw(500, 'Unexpected type')
      }
    }
  });
  return app.listen(3000);
}