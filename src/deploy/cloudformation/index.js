export default () => ({
  AWSTemplateFormatVersion: '2010-09-09',
  Parameters: {

    KeyName: {
      Type: 'AWS::EC2::KeyPair::KeyName',
      Description: 'Name of an existing EC2 KeyPair to enable SSH access to the ECS instances'
    },
    SubnetId: {
      Type: 'List<AWS::EC2::Subnet::Id>',
      Description: 'List of an existing subnet IDs to use for the load balancer and auto scaling group'
    },
    DesiredCapacity: {
      Type: 'Number',
      Default: '1',
      Description: 'Number of instances to launch in your ECS cluster'
    },
    MaxSize: {
      Type: 'Number',
      Default: '1',
      Description: 'Maximum number of instances that can be launched in your ECS cluster'
    },
    InstanceType: {
      Description: 'The EC2 instance type',
      Type: 'String',
      Default: 't2.micro',
      AllowedValues: ['t2.micro', 't2.small', 't2.medium', 'm3.medium', 'm3.large', 'm3.xlarge',
        'm3.2xlarge', 'c3.large', 'c3.xlarge', 'c3.2xlarge', 'c3.4xlarge', 'c3.8xlarge', 'c4.large', 'c4.xlarge',
        'c4.2xlarge', 'c4.4xlarge', 'c4.8xlarge', 'r3.large', 'r3.xlarge', 'r3.2xlarge', 'r3.4xlarge', 'r3.8xlarge',
        'i2.xlarge', 'i2.2xlarge', 'i2.4xlarge', 'i2.8xlarge', 'd2.xlarge', 'd2.2xlarge', 'd2.4xlarge', 'd2.8xlarge',
        'hi1.4xlarge', 'hs1.8xlarge', 'cr1.8xlarge', 'cc2.8xlarge'],
      ConstraintDescription: 'must be a valid EC2 instance type.'
    },
    SshLocation: {
      Description: ' The IP address range that can be used to SSH to the EC2 instances',
      Type: 'String',
      MinLength: '9',
      MaxLength: '18',
      Default: '0.0.0.0/0',
      AllowedPattern: '(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})/(\\d{1,2})',
      ConstraintDescription: 'must be a valid IP CIDR range of the form x.x.x.x/x.'
    },

    NotificationEmail: {
      Description: 'EMail address to notify if there are any scaling operations',
      Type: 'String',
      AllowedPattern: '([a-zA-Z0-9_\\-\\.]+)@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.)|(([a-zA-Z0-9\\-]+\\.)+))([a-zA-Z]{2,4}|[0-9]{1,3})(\\]?)',
      ConstraintDescription: 'must be a valid email address.'
    }

  },
  Mappings: {
    AWSRegionToAMI: {
      'us-east-1': {AMIID: 'ami-5f59ac34'},
      'us-west-2': {AMIID: 'ami-c188b0f1'},
      'eu-west-1': {AMIID: 'ami-3db4ca4a'},
      'ap-northeast-1': {AMIID: 'ami-ca01d8ca'},
      'ap-southeast-2': {AMIID: 'ami-5b5d2661'}
    }
  },
  Resources: {
    ECSCluster: {
      Type: 'AWS::ECS::Cluster',
      DependsOn: 'RouterDynamoDBTable'
    },
    TaskDefinition: {
      Type: 'AWS::ECS::TaskDefinition',
      Properties: {
        ContainerDefinitions: [
          {
            Name: 'lambda-router',
            Cpu: '10',
            Essential: 'true',
            Image: 'jamiemccrindle/lambda-router',
            Memory: '300',
            PortMappings: [
              {HostPort: 3000, ContainerPort: 3000}
            ],
            Command: ['server', '-t', {Ref: 'AWS::StackName'}]
          }
        ]
      }
    },

    RouterLoadBalancer: {
      Type: 'AWS::ElasticLoadBalancing::LoadBalancer',
      Properties: {
        Subnets: {Ref: 'SubnetId'},
        CrossZone: 'True',
        Listeners: [{
          LoadBalancerPort: '80',
          InstancePort: '3000',
          Protocol: 'HTTP'
        }],
        HealthCheck: {
          HealthyThreshold: '2',
          Interval: '30',
          Target: 'HTTP:3000/status',
          Timeout: '10',
          UnhealthyThreshold: '2'
        }
      }
    },

    ECSAutoScalingGroup: {
      Type: 'AWS::AutoScaling::AutoScalingGroup',
      Properties: {
        VPCZoneIdentifier: {Ref: 'SubnetId'},
        LaunchConfigurationName: {Ref: 'ContainerInstances'},
        MinSize: '1',
        MaxSize: {Ref: 'MaxSize'},
        DesiredCapacity: {Ref: 'DesiredCapacity'},
        NotificationConfigurations: [{
          TopicARN: {Ref: 'NotificationTopic'},
          NotificationTypes: ['autoscaling:EC2_INSTANCE_LAUNCH',
            'autoscaling:EC2_INSTANCE_LAUNCH_ERROR',
            'autoscaling:EC2_INSTANCE_TERMINATE',
            'autoscaling:EC2_INSTANCE_TERMINATE_ERROR']
        }]
      },
      CreationPolicy: {
        ResourceSignal: {
          Timeout: 'PT15M'
        }
      },
      UpdatePolicy: {
        AutoScalingRollingUpdate: {
          MinInstancesInService: '1',
          MaxBatchSize: '1',
          PauseTime: 'PT15M',
          WaitOnResourceSignals: 'true'
        }
      }
    },

    ELBUnHealthyHostsAlarm: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmDescription: 'Alerts when number of unhealthy hosts in ELB greater than or equal to 1',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        EvaluationPeriods: '1',
        MetricName: 'UnHealthyHostCount',
        Namespace: 'AWS/ELB',
        Period: '60',
        Statistic: 'Maximum',
        Threshold: '1',
        Dimensions: [
          {
            Name: 'LoadBalancerName',
            Value: {Ref: 'RouterLoadBalancer'}
          }
        ],
        AlarmActions: [{Ref: 'NotificationTopic'}],
        OKActions: [{Ref: 'NotificationTopic'}]
      }
    },

    WebServerScaleUpPolicy: {
      Type: 'AWS::AutoScaling::ScalingPolicy',
      Properties: {
        AdjustmentType: 'ChangeInCapacity',
        AutoScalingGroupName: {Ref: 'ECSAutoScalingGroup'},
        Cooldown: '60',
        ScalingAdjustment: '1'
      }
    },
    WebServerScaleDownPolicy: {
      Type: 'AWS::AutoScaling::ScalingPolicy',
      Properties: {
        AdjustmentType: 'ChangeInCapacity',
        AutoScalingGroupName: {Ref: 'ECSAutoScalingGroup'},
        Cooldown: '60',
        ScalingAdjustment: '-1'
      }
    },

    CPUAlarmHigh: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmDescription: 'Scale-up if CPU > 90% for 10 minutes',
        MetricName: 'CPUUtilization',
        Namespace: 'AWS/EC2',
        Statistic: 'Average',
        Period: '300',
        EvaluationPeriods: '2',
        Threshold: '90',
        AlarmActions: [{Ref: 'WebServerScaleUpPolicy'}],
        Dimensions: [
          {
            Name: 'AutoScalingGroupName',
            Value: {Ref: 'ECSAutoScalingGroup'}
          }
        ],
        ComparisonOperator: 'GreaterThanThreshold'
      }
    },
    CPUAlarmLow: {
      Type: 'AWS::CloudWatch::Alarm',
      Properties: {
        AlarmDescription: 'Scale-down if CPU < 70% for 10 minutes',
        MetricName: 'CPUUtilization',
        Namespace: 'AWS/EC2',
        Statistic: 'Average',
        Period: '300',
        EvaluationPeriods: '2',
        Threshold: '70',
        AlarmActions: [{Ref: 'WebServerScaleDownPolicy'}],
        Dimensions: [
          {
            Name: 'AutoScalingGroupName',
            Value: {Ref: 'ECSAutoScalingGroup'}
          }
        ],
        ComparisonOperator: 'LessThanThreshold'
      }
    },

    ContainerInstances: {
      Type: 'AWS::AutoScaling::LaunchConfiguration',
      Metadata: {
        'AWS::CloudFormation::Init': {
          config: {

            commands: {
              '01_add_instance_to_cluster': {
                command: {'Fn::Join': ['', ['#!/bin/bash\n', 'echo ECS_CLUSTER=', {Ref: 'ECSCluster'}, ' >> /etc/ecs/ecs.config']]}
              }
            },

            files: {
              '/etc/cfn/cfn-hup.conf': {
                content: {
                  'Fn::Join': ['', [
                    '[main]\n',
                    'stack=', {Ref: 'AWS::StackId'}, '\n',
                    'region=', {Ref: 'AWS::Region'}, '\n'
                  ]]
                },
                mode: '000400',
                owner: 'root',
                group: 'root'
              },
              '/etc/cfn/hooks.d/cfn-auto-reloader.conf': {
                content: {
                  'Fn::Join': ['', [
                    '[cfn-auto-reloader-hook]\n',
                    'triggers=post.update\n',
                    'path=Resources.ContainerInstances.Metadata.AWS::CloudFormation::Init\n',
                    'action=/opt/aws/bin/cfn-init -v ',
                    '         --stack ', {Ref: 'AWS::StackName'},
                    '         --resource ContainerInstances ',
                    '         --region ', {Ref: 'AWS::Region'}, '\n',
                    'runas=root\n'
                  ]]
                }
              }
            },

            services: {
              sysvinit: {
                'cfn-hup': {
                  enabled: 'true',
                  ensureRunning: 'true',
                  files: ['/etc/cfn/cfn-hup.conf', '/etc/cfn/hooks.d/cfn-auto-reloader.conf']
                }
              }
            }
          }
        }
      },
      Properties: {
        ImageId: {'Fn::FindInMap': ['AWSRegionToAMI', {Ref: 'AWS::Region'}, 'AMIID']},
        InstanceType: {Ref: 'InstanceType'},
        IamInstanceProfile: {Ref: 'EC2InstanceProfile'},
        KeyName: {Ref: 'KeyName'},
        UserData: {
          'Fn::Base64': {
            'Fn::Join': ['', [
              '#!/bin/bash -xe\n',
              'yum install -y aws-cfn-bootstrap\n',

              '/opt/aws/bin/cfn-init -v ',
              '         --stack ', {Ref: 'AWS::StackName'},
              '         --resource ContainerInstances ',
              '         --region ', {Ref: 'AWS::Region'}, '\n',

              '/opt/aws/bin/cfn-signal -e $? ',
              '         --stack ', {Ref: 'AWS::StackName'},
              '         --resource ECSAutoScalingGroup ',
              '         --region ', {Ref: 'AWS::Region'}, '\n'
            ]]
          }
        }
      }
    },
    Service: {
      Type: 'AWS::ECS::Service',
      DependsOn: ['ECSAutoScalingGroup'],
      Properties: {
        Cluster: {Ref: 'ECSCluster'},
        DesiredCount: '1',
        LoadBalancers: [
          {
            ContainerName: 'lambda-router',
            ContainerPort: '3000',
            LoadBalancerName: {Ref: 'RouterLoadBalancer'}
          }
        ],
        Role: {Ref: 'ECSServiceRole'},
        TaskDefinition: {Ref: 'TaskDefinition'}
      }
    },
    ECSServiceRole: {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: [
                  'ecs.amazonaws.com'
                ]
              },
              Action: [
                'sts:AssumeRole'
              ]
            }
          ]
        },
        Path: '/',
        Policies: [
          {
            PolicyName: 'ecs-service',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'elasticloadbalancing:Describe*',
                    'elasticloadbalancing:DeregisterInstancesFromLoadBalancer',
                    'elasticloadbalancing:RegisterInstancesWithLoadBalancer',
                    'ec2:Describe*',
                    'ec2:AuthorizeSecurityGroupIngress'
                  ],
                  Resource: '*'
                }
              ]
            }
          }
        ]
      }
    },
    'EC2Role': {
      Type: 'AWS::IAM::Role',
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: [
                  'ec2.amazonaws.com'
                ]
              },
              Action: [
                'sts:AssumeRole'
              ]
            }
          ]
        },
        Path: '/',
        Policies: [
          {
            PolicyName: 'ecs-service',
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Action: [
                    'ecs:CreateCluster',
                    'ecs:RegisterContainerInstance',
                    'ecs:DeregisterContainerInstance',
                    'ecs:DiscoverPollEndpoint',
                    'ecs:Submit*',
                    'ecs:Poll',
                    'lambda:InvokeFunction'
                  ],
                  Resource: '*'
                },
                {
                  Effect: 'Allow',
                  Action: [
                    "dynamodb:Query",
                    "dynamodb:Scan"
                  ],
                  Resource: {'Fn::Join': ['', [
                    'arn:aws:dynamodb:', {Ref: 'AWS::Region'}, ':', {Ref: 'AWS::AccountId'}, ':', 'table/', {Ref: 'AWS::StackName'}
                  ]]}
                }
              ]
            }
          }
        ]
      }
    },
    'EC2InstanceProfile': {
      Type: 'AWS::IAM::InstanceProfile',
      Properties: {
        Path: '/',
        Roles: [
          {
            Ref: 'EC2Role'
          }
        ]
      }
    },

    NotificationTopic: {
      Type: 'AWS::SNS::Topic',
      Properties: {
        Subscription: [{Endpoint: {Ref: 'NotificationEmail'}, Protocol: 'email'}]
      }
    },

    "RouterDynamoDBTable": {
      "Type": "AWS::DynamoDB::Table",
      "Properties": {
        "AttributeDefinitions": [
          {
            "AttributeName": "Id",
            "AttributeType": "S"
          }
        ],
        "KeySchema": [
          {
            "AttributeName": "Id",
            "KeyType": "HASH"
          }
        ],
        "ProvisionedThroughput": {
          "ReadCapacityUnits": "1",
          "WriteCapacityUnits": "1"
        },
        "TableName": {Ref: "AWS::StackName"}
      }
    }
  },
  Outputs: {
    LoadBalancer: {
      Description: 'Load Balancer',
      Value: {Ref: 'RouterLoadBalancer'}
    },
    Cluster: {
      Description: 'ECS Cluster',
      Value: {Ref: 'ECSCluster'}
    }
  }
});
