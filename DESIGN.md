# Lambda Router

## Goals

* Must not require regular deployments
* Must be dynamically configurable
* Dynamic configuration must be resilient
* Must support blue / green deployments
* Must support multiple environments (same as above)
* Must be able to route to lambda functions, configurably

## Routing table

routing
    methods: list of methods to match or '*'
    hosts: host matcher
    uri: path-to-regexp matcher
    lambda_function_name: name of lambda function
    lambda_qualifier: the lambda qualifier

## Managing upgrades

### In place update

* Update existing lambda function

### Blue / Green

* Deploy new lambda function with new name / version
* Update routing to point to new version...
