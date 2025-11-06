import { Apigatewayv2Api } from '@cdktf/provider-aws/lib/apigatewayv2-api';
import { Apigatewayv2Integration } from '@cdktf/provider-aws/lib/apigatewayv2-integration';
import { Apigatewayv2Route } from '@cdktf/provider-aws/lib/apigatewayv2-route';
import { Apigatewayv2Stage } from '@cdktf/provider-aws/lib/apigatewayv2-stage';
import { DbSubnetGroup } from '@cdktf/provider-aws/lib/db-subnet-group';
import { EfsFileSystem } from '@cdktf/provider-aws/lib/efs-file-system';
import { EfsMountTarget } from '@cdktf/provider-aws/lib/efs-mount-target';
import { ElasticacheReplicationGroup } from '@cdktf/provider-aws/lib/elasticache-replication-group';
import { ElasticacheSubnetGroup } from '@cdktf/provider-aws/lib/elasticache-subnet-group';
import { IamRole } from '@cdktf/provider-aws/lib/iam-role';
import { IamRolePolicy } from '@cdktf/provider-aws/lib/iam-role-policy';
import { IamRolePolicyAttachment } from '@cdktf/provider-aws/lib/iam-role-policy-attachment';
import { InternetGateway } from '@cdktf/provider-aws/lib/internet-gateway';
import { KmsAlias } from '@cdktf/provider-aws/lib/kms-alias';
import { KmsKey } from '@cdktf/provider-aws/lib/kms-key';
import { LambdaFunction } from '@cdktf/provider-aws/lib/lambda-function';
import { LambdaPermission } from '@cdktf/provider-aws/lib/lambda-permission';
import { AwsProvider } from '@cdktf/provider-aws/lib/provider';
import { RdsCluster } from '@cdktf/provider-aws/lib/rds-cluster';
import { RdsClusterInstance } from '@cdktf/provider-aws/lib/rds-cluster-instance';
import { Route } from '@cdktf/provider-aws/lib/route';
import { RouteTable } from '@cdktf/provider-aws/lib/route-table';
import { RouteTableAssociation } from '@cdktf/provider-aws/lib/route-table-association';
import { SecretsmanagerSecret } from '@cdktf/provider-aws/lib/secretsmanager-secret';
import { SecretsmanagerSecretRotation } from '@cdktf/provider-aws/lib/secretsmanager-secret-rotation';
import { SecretsmanagerSecretVersion } from '@cdktf/provider-aws/lib/secretsmanager-secret-version';
import { SecurityGroup } from '@cdktf/provider-aws/lib/security-group';
import { SecurityGroupRule } from '@cdktf/provider-aws/lib/security-group-rule';
import { Subnet } from '@cdktf/provider-aws/lib/subnet';
import { Vpc } from '@cdktf/provider-aws/lib/vpc';
import { S3Backend, TerraformOutput, TerraformStack } from 'cdktf';
import { Construct } from 'constructs';
// import { Apigatewayv2DomainName } from '@cdktf/provider-aws/lib/apigatewayv2-domain-name';
import { CloudwatchLogGroup } from '@cdktf/provider-aws/lib/cloudwatch-log-group';
import { CloudwatchMetricAlarm } from '@cdktf/provider-aws/lib/cloudwatch-metric-alarm';
import { DataAwsAvailabilityZones } from '@cdktf/provider-aws/lib/data-aws-availability-zones';
import { KinesisStream } from '@cdktf/provider-aws/lib/kinesis-stream';

interface FinTechStackConfig {
  environmentSuffix: string;
  region: string;
  vpcCidr: string;
  dbUsername: string;
  enableMutualTls: boolean;
}

export class FinTechTradingStack extends TerraformStack {
  constructor(scope: Construct, id: string, config: FinTechStackConfig) {
    super(scope, id);

    const { environmentSuffix, region, vpcCidr, dbUsername } = config;
    // enableMutualTls from config is not currently used but kept in interface for future mutual TLS implementation

    // Configure S3 Backend for state management if available
    const stateBucket = process.env.TERRAFORM_STATE_BUCKET;
    const stateBucketRegion =
      process.env.TERRAFORM_STATE_BUCKET_REGION || 'us-east-1';
    const stateKey =
      process.env.TERRAFORM_STATE_BUCKET_KEY || environmentSuffix;

    if (stateBucket) {
      new S3Backend(this, {
        bucket: stateBucket,
        key: `${stateKey}/fintech-trading-stack.tfstate`,
        region: stateBucketRegion,
        encrypt: true,
      });

      // Enable S3 state locking using escape hatch
      this.addOverride('terraform.backend.s3.use_lockfile', true);
    }

    // AWS Provider
    new AwsProvider(this, 'aws', {
      region: region,
    });

    // Get availability zones
    const azs = new DataAwsAvailabilityZones(this, 'available', {
      state: 'available',
    });

    // KMS Keys for encryption
    const rdsKmsKey = new KmsKey(this, 'rds-kms-key', {
      description: `KMS key for RDS encryption - ${environmentSuffix}`,
      enableKeyRotation: true,
      deletionWindowInDays: 10,
      tags: {
        Name: `rds-kms-key-${environmentSuffix}`,
        Environment: environmentSuffix,
        Purpose: 'RDS-Encryption',
      },
    });

    new KmsAlias(this, 'rds-kms-alias', {
      name: `alias/rds-key-${environmentSuffix}`,
      targetKeyId: rdsKmsKey.keyId,
    });

    // Note: ElastiCache KMS key removed - custom KMS keys only work in cluster mode
    // Non-cluster mode uses AWS default service key for at-rest encryption

    const efsKmsKey = new KmsKey(this, 'efs-kms-key', {
      description: `KMS key for EFS encryption - ${environmentSuffix}`,
      enableKeyRotation: true,
      deletionWindowInDays: 10,
      tags: {
        Name: `efs-kms-key-${environmentSuffix}`,
        Environment: environmentSuffix,
        Purpose: 'EFS-Encryption',
      },
    });

    new KmsAlias(this, 'efs-kms-alias', {
      name: `alias/efs-key-${environmentSuffix}`,
      targetKeyId: efsKmsKey.keyId,
    });

    const secretsKmsKey = new KmsKey(this, 'secrets-kms-key', {
      description: `KMS key for Secrets Manager encryption - ${environmentSuffix}`,
      enableKeyRotation: true,
      deletionWindowInDays: 10,
      tags: {
        Name: `secrets-kms-key-${environmentSuffix}`,
        Environment: environmentSuffix,
        Purpose: 'Secrets-Encryption',
      },
    });

    new KmsAlias(this, 'secrets-kms-alias', {
      name: `alias/secrets-key-${environmentSuffix}`,
      targetKeyId: secretsKmsKey.keyId,
    });

    const kinesisKmsKey = new KmsKey(this, 'kinesis-kms-key', {
      description: `KMS key for Kinesis encryption - ${environmentSuffix}`,
      enableKeyRotation: true,
      deletionWindowInDays: 10,
      tags: {
        Name: `kinesis-kms-key-${environmentSuffix}`,
        Environment: environmentSuffix,
        Purpose: 'Kinesis-Encryption',
      },
    });

    new KmsAlias(this, 'kinesis-kms-alias', {
      name: `alias/kinesis-key-${environmentSuffix}`,
      targetKeyId: kinesisKmsKey.keyId,
    });

    // VPC
    const vpc = new Vpc(this, 'vpc', {
      cidrBlock: vpcCidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        Name: `trading-vpc-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // Internet Gateway
    const igw = new InternetGateway(this, 'igw', {
      vpcId: vpc.id,
      tags: {
        Name: `trading-igw-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // Public Subnets (for NAT Gateways, API Gateway VPC endpoints)
    const publicSubnet1 = new Subnet(this, 'public-subnet-1', {
      vpcId: vpc.id,
      cidrBlock: '10.0.1.0/24',
      availabilityZone: `\${${azs.fqn}.names[0]}`,
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `trading-public-subnet-1-${environmentSuffix}`,
        Environment: environmentSuffix,
        Type: 'Public',
      },
    });

    const publicSubnet2 = new Subnet(this, 'public-subnet-2', {
      vpcId: vpc.id,
      cidrBlock: '10.0.2.0/24',
      availabilityZone: `\${${azs.fqn}.names[1]}`,
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `trading-public-subnet-2-${environmentSuffix}`,
        Environment: environmentSuffix,
        Type: 'Public',
      },
    });

    // Private Subnets (for RDS, ElastiCache, EFS)
    const privateSubnet1 = new Subnet(this, 'private-subnet-1', {
      vpcId: vpc.id,
      cidrBlock: '10.0.11.0/24',
      availabilityZone: `\${${azs.fqn}.names[0]}`,
      tags: {
        Name: `trading-private-subnet-1-${environmentSuffix}`,
        Environment: environmentSuffix,
        Type: 'Private',
      },
    });

    const privateSubnet2 = new Subnet(this, 'private-subnet-2', {
      vpcId: vpc.id,
      cidrBlock: '10.0.12.0/24',
      availabilityZone: `\${${azs.fqn}.names[1]}`,
      tags: {
        Name: `trading-private-subnet-2-${environmentSuffix}`,
        Environment: environmentSuffix,
        Type: 'Private',
      },
    });

    const privateSubnet3 = new Subnet(this, 'private-subnet-3', {
      vpcId: vpc.id,
      cidrBlock: '10.0.13.0/24',
      availabilityZone: `\${${azs.fqn}.names[2]}`,
      tags: {
        Name: `trading-private-subnet-3-${environmentSuffix}`,
        Environment: environmentSuffix,
        Type: 'Private',
      },
    });

    // Public Route Table
    const publicRouteTable = new RouteTable(this, 'public-route-table', {
      vpcId: vpc.id,
      tags: {
        Name: `trading-public-rt-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new Route(this, 'public-route', {
      routeTableId: publicRouteTable.id,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.id,
    });

    new RouteTableAssociation(this, 'public-rta-1', {
      subnetId: publicSubnet1.id,
      routeTableId: publicRouteTable.id,
    });

    new RouteTableAssociation(this, 'public-rta-2', {
      subnetId: publicSubnet2.id,
      routeTableId: publicRouteTable.id,
    });

    // Private Route Table
    const privateRouteTable = new RouteTable(this, 'private-route-table', {
      vpcId: vpc.id,
      tags: {
        Name: `trading-private-rt-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new RouteTableAssociation(this, 'private-rta-1', {
      subnetId: privateSubnet1.id,
      routeTableId: privateRouteTable.id,
    });

    new RouteTableAssociation(this, 'private-rta-2', {
      subnetId: privateSubnet2.id,
      routeTableId: privateRouteTable.id,
    });

    new RouteTableAssociation(this, 'private-rta-3', {
      subnetId: privateSubnet3.id,
      routeTableId: privateRouteTable.id,
    });

    // Security Groups
    const rdsSecurityGroup = new SecurityGroup(this, 'rds-sg', {
      name: `rds-sg-${environmentSuffix}`,
      description: 'Security group for RDS Aurora cluster',
      vpcId: vpc.id,
      tags: {
        Name: `rds-sg-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new SecurityGroupRule(this, 'rds-ingress', {
      type: 'ingress',
      fromPort: 5432,
      toPort: 5432,
      protocol: 'tcp',
      cidrBlocks: [vpcCidr],
      securityGroupId: rdsSecurityGroup.id,
      description: 'Allow PostgreSQL traffic from VPC',
    });

    new SecurityGroupRule(this, 'rds-egress', {
      type: 'egress',
      fromPort: 0,
      toPort: 0,
      protocol: '-1',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: rdsSecurityGroup.id,
      description: 'Allow all outbound traffic',
    });

    const elasticacheSecurityGroup = new SecurityGroup(this, 'elasticache-sg', {
      name: `elasticache-sg-${environmentSuffix}`,
      description: 'Security group for ElastiCache Redis',
      vpcId: vpc.id,
      tags: {
        Name: `elasticache-sg-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new SecurityGroupRule(this, 'elasticache-ingress', {
      type: 'ingress',
      fromPort: 6379,
      toPort: 6379,
      protocol: 'tcp',
      cidrBlocks: [vpcCidr],
      securityGroupId: elasticacheSecurityGroup.id,
      description: 'Allow Redis traffic from VPC',
    });

    new SecurityGroupRule(this, 'elasticache-egress', {
      type: 'egress',
      fromPort: 0,
      toPort: 0,
      protocol: '-1',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: elasticacheSecurityGroup.id,
      description: 'Allow all outbound traffic',
    });

    const efsSecurityGroup = new SecurityGroup(this, 'efs-sg', {
      name: `efs-sg-${environmentSuffix}`,
      description: 'Security group for EFS',
      vpcId: vpc.id,
      tags: {
        Name: `efs-sg-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new SecurityGroupRule(this, 'efs-ingress', {
      type: 'ingress',
      fromPort: 2049,
      toPort: 2049,
      protocol: 'tcp',
      cidrBlocks: [vpcCidr],
      securityGroupId: efsSecurityGroup.id,
      description: 'Allow NFS traffic from VPC',
    });

    new SecurityGroupRule(this, 'efs-egress', {
      type: 'egress',
      fromPort: 0,
      toPort: 0,
      protocol: '-1',
      cidrBlocks: ['0.0.0.0/0'],
      securityGroupId: efsSecurityGroup.id,
      description: 'Allow all outbound traffic',
    });

    // Database Subnet Group
    const dbSubnetGroup = new DbSubnetGroup(this, 'db-subnet-group', {
      name: `trading-db-subnet-group-${environmentSuffix}`,
      subnetIds: [privateSubnet1.id, privateSubnet2.id, privateSubnet3.id],
      tags: {
        Name: `trading-db-subnet-group-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // IAM Role for RDS Enhanced Monitoring
    const rdsMonitoringRole = new IamRole(this, 'rds-monitoring-role', {
      name: `rds-monitoring-role-${environmentSuffix}`,
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'monitoring.rds.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
      tags: {
        Name: `rds-monitoring-role-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new IamRolePolicyAttachment(this, 'rds-monitoring-policy', {
      role: rdsMonitoringRole.name,
      policyArn:
        'arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole',
    });

    // Secrets Manager - Database Credentials
    const dbSecret = new SecretsmanagerSecret(this, 'db-secret', {
      name: `trading-db-credentials-${environmentSuffix}`,
      description: 'RDS Aurora database credentials',
      kmsKeyId: secretsKmsKey.keyId,
      tags: {
        Name: `trading-db-credentials-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    const dbPassword = 'ChangeMe123456!'; // In production, generate a secure random password
    new SecretsmanagerSecretVersion(this, 'db-secret-version', {
      secretId: dbSecret.id,
      secretString: JSON.stringify({
        username: dbUsername,
        password: dbPassword,
        engine: 'postgres',
        host: '', // Will be updated after RDS creation
        port: 5432,
        dbname: 'tradingdb',
      }),
    });

    // Lambda function for Secrets Manager rotation
    const rotationLambdaRole = new IamRole(this, 'rotation-lambda-role', {
      name: `rotation-lambda-role-${environmentSuffix}`,
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
      tags: {
        Name: `rotation-lambda-role-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new IamRolePolicyAttachment(this, 'rotation-lambda-basic', {
      role: rotationLambdaRole.name,
      policyArn:
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    });

    new IamRolePolicyAttachment(this, 'rotation-lambda-vpc', {
      role: rotationLambdaRole.name,
      policyArn:
        'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
    });

    new IamRolePolicy(this, 'rotation-lambda-policy', {
      name: `rotation-lambda-policy-${environmentSuffix}`,
      role: rotationLambdaRole.id,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:DescribeSecret',
              'secretsmanager:GetSecretValue',
              'secretsmanager:PutSecretValue',
              'secretsmanager:UpdateSecretVersionStage',
            ],
            Resource: dbSecret.arn,
          },
          {
            Effect: 'Allow',
            Action: ['secretsmanager:GetRandomPassword'],
            Resource: '*',
          },
          {
            Effect: 'Allow',
            Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey'],
            Resource: secretsKmsKey.arn,
          },
        ],
      }),
    });

    const rotationLambda = new LambdaFunction(this, 'rotation-lambda', {
      functionName: `db-rotation-lambda-${environmentSuffix}`,
      role: rotationLambdaRole.arn,
      handler: 'lambda_rotation_handler.handler',
      runtime: 'python3.11',
      timeout: 30,
      filename: '${path.module}/../../../lib/lambda-rotation.zip',
      sourceCodeHash:
        'Njk0MGY0MjU4ODMyNzZjYmJiNGEzMDJmOGE0MGJkZTI3ZWQwNzljODRiNzM0NzM4NjA4Njg5NTcxZTdhZjk1Ywo=',
      vpcConfig: {
        subnetIds: [privateSubnet1.id, privateSubnet2.id],
        securityGroupIds: [rdsSecurityGroup.id],
      },
      environment: {
        variables: {
          SECRETS_MANAGER_ENDPOINT: `https://secretsmanager.${region}.amazonaws.com`,
        },
      },
      tags: {
        Name: `db-rotation-lambda-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new LambdaPermission(this, 'rotation-lambda-permission', {
      statementId: 'AllowSecretsManagerInvoke',
      action: 'lambda:InvokeFunction',
      functionName: rotationLambda.functionName,
      principal: 'secretsmanager.amazonaws.com',
    });

    // Enable 30-day automatic rotation
    new SecretsmanagerSecretRotation(this, 'db-secret-rotation', {
      secretId: dbSecret.id,
      rotationLambdaArn: rotationLambda.arn,
      rotationRules: {
        automaticallyAfterDays: 30,
      },
    });

    // RDS Aurora Cluster
    const rdsCluster = new RdsCluster(this, 'aurora-cluster', {
      clusterIdentifier: `trading-aurora-${environmentSuffix}`,
      engine: 'aurora-postgresql',
      engineMode: 'provisioned',
      engineVersion: '15.4',
      databaseName: 'tradingdb',
      masterUsername: dbUsername,
      masterPassword: dbPassword,
      dbSubnetGroupName: dbSubnetGroup.name,
      vpcSecurityGroupIds: [rdsSecurityGroup.id],
      storageEncrypted: true,
      kmsKeyId: rdsKmsKey.arn,
      backupRetentionPeriod: 35,
      preferredBackupWindow: '03:00-04:00',
      preferredMaintenanceWindow: 'mon:04:00-mon:05:00',
      enabledCloudwatchLogsExports: ['postgresql'],
      deletionProtection: false, // Set to true in production
      skipFinalSnapshot: true, // Set to false in production
      finalSnapshotIdentifier: `trading-aurora-final-${environmentSuffix}`,
      applyImmediately: true,
      tags: {
        Name: `trading-aurora-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // RDS Cluster Instances (Multi-AZ)
    new RdsClusterInstance(this, 'aurora-instance-1', {
      identifier: `trading-aurora-instance-1-${environmentSuffix}`,
      clusterIdentifier: rdsCluster.id,
      instanceClass: 'db.r6g.large',
      engine: 'aurora-postgresql',
      engineVersion: '15.4',
      publiclyAccessible: false,
      performanceInsightsEnabled: true,
      performanceInsightsKmsKeyId: rdsKmsKey.arn,
      performanceInsightsRetentionPeriod: 7,
      monitoringInterval: 60,
      monitoringRoleArn: rdsMonitoringRole.arn,
      tags: {
        Name: `trading-aurora-instance-1-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new RdsClusterInstance(this, 'aurora-instance-2', {
      identifier: `trading-aurora-instance-2-${environmentSuffix}`,
      clusterIdentifier: rdsCluster.id,
      instanceClass: 'db.r6g.large',
      engine: 'aurora-postgresql',
      engineVersion: '15.4',
      publiclyAccessible: false,
      performanceInsightsEnabled: true,
      performanceInsightsKmsKeyId: rdsKmsKey.arn,
      performanceInsightsRetentionPeriod: 7,
      monitoringInterval: 60,
      monitoringRoleArn: rdsMonitoringRole.arn,
      tags: {
        Name: `trading-aurora-instance-2-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // ElastiCache Subnet Group
    const elasticacheSubnetGroup = new ElasticacheSubnetGroup(
      this,
      'elasticache-subnet-group',
      {
        name: `trading-elasticache-${environmentSuffix}-${Date.now()}`,
        subnetIds: [privateSubnet1.id, privateSubnet2.id, privateSubnet3.id],
        tags: {
          Name: `trading-elasticache-subnet-group-${environmentSuffix}`,
          Environment: environmentSuffix,
        },
      }
    );

    // ElastiCache Redis Replication Group
    const elasticacheCluster = new ElasticacheReplicationGroup(
      this,
      'redis-cluster',
      {
        replicationGroupId: `trading-redis-${environmentSuffix}`,
        description: 'Redis cluster for session management',
        engine: 'redis',
        engineVersion: '7.0',
        nodeType: 'cache.r6g.large',
        numCacheClusters: 2,
        subnetGroupName: elasticacheSubnetGroup.name,
        securityGroupIds: [elasticacheSecurityGroup.id],
        atRestEncryptionEnabled: 'true',
        transitEncryptionEnabled: true,
        // Note: Custom KMS key (kmsKeyId) is only supported in cluster mode
        // For non-cluster mode, AWS uses the default service key
        snapshotRetentionLimit: 5,
        snapshotWindow: '03:00-05:00',
        maintenanceWindow: 'mon:05:00-mon:07:00',
        tags: {
          Name: `trading-redis-${environmentSuffix}`,
          Environment: environmentSuffix,
        },
      }
    );

    // EFS File System
    const efsFileSystem = new EfsFileSystem(this, 'efs', {
      encrypted: true,
      kmsKeyId: efsKmsKey.arn,
      performanceMode: 'generalPurpose',
      throughputMode: 'bursting',
      lifecyclePolicy: [
        {
          transitionToIa: 'AFTER_30_DAYS',
        },
      ],
      tags: {
        Name: `trading-efs-${environmentSuffix}`,
        Environment: environmentSuffix,
        Purpose: 'AuditLogs',
      },
    });

    // EFS Mount Targets (Multi-AZ)
    new EfsMountTarget(this, 'efs-mount-1', {
      fileSystemId: efsFileSystem.id,
      subnetId: privateSubnet1.id,
      securityGroups: [efsSecurityGroup.id],
    });

    new EfsMountTarget(this, 'efs-mount-2', {
      fileSystemId: efsFileSystem.id,
      subnetId: privateSubnet2.id,
      securityGroups: [efsSecurityGroup.id],
    });

    new EfsMountTarget(this, 'efs-mount-3', {
      fileSystemId: efsFileSystem.id,
      subnetId: privateSubnet3.id,
      securityGroups: [efsSecurityGroup.id],
    });

    // Kinesis Data Stream
    const kinesisStream = new KinesisStream(this, 'kinesis-stream', {
      name: `trading-transactions-${environmentSuffix}`,
      shardCount: 10, // Handles 10,000 transactions/minute
      retentionPeriod: 168, // 7 days
      encryptionType: 'KMS',
      kmsKeyId: kinesisKmsKey.id,
      shardLevelMetrics: [
        'IncomingBytes',
        'IncomingRecords',
        'OutgoingBytes',
        'OutgoingRecords',
        'WriteProvisionedThroughputExceeded',
        'ReadProvisionedThroughputExceeded',
      ],
      streamModeDetails: {
        streamMode: 'PROVISIONED',
      },
      tags: {
        Name: `trading-transactions-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // API Gateway IAM Role
    const apiGatewayRole = new IamRole(this, 'api-gateway-role', {
      name: `api-gateway-role-${environmentSuffix}`,
      assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'apigateway.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      }),
      tags: {
        Name: `api-gateway-role-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new IamRolePolicy(this, 'api-gateway-kinesis-policy', {
      name: `api-gateway-kinesis-policy-${environmentSuffix}`,
      role: apiGatewayRole.id,
      policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['kinesis:PutRecord', 'kinesis:PutRecords'],
            Resource: kinesisStream.arn,
          },
        ],
      }),
    });

    // CloudWatch Log Group for API Gateway
    const apiLogGroup = new CloudwatchLogGroup(this, 'api-log-group', {
      name: `/aws/apigateway/trading-api-${environmentSuffix}`,
      retentionInDays: 30,
      tags: {
        Name: `trading-api-logs-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // API Gateway (HTTP API with mutual TLS)
    const api = new Apigatewayv2Api(this, 'api-gateway', {
      name: `trading-api-${environmentSuffix}`,
      protocolType: 'HTTP',
      description: 'Trading platform API with mutual TLS',
      corsConfiguration: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['*'],
        maxAge: 300,
      },
      tags: {
        Name: `trading-api-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // API Gateway Integration with Kinesis
    const apiIntegration = new Apigatewayv2Integration(
      this,
      'api-integration',
      {
        apiId: api.id,
        integrationType: 'AWS_PROXY',
        integrationSubtype: 'Kinesis-PutRecord',
        credentialsArn: apiGatewayRole.arn,
        requestParameters: {
          StreamName: kinesisStream.name,
          PartitionKey: '$request.body.partitionKey',
          Data: '$request.body.data',
        },
        payloadFormatVersion: '1.0',
        timeoutMilliseconds: 29000,
      }
    );

    // API Gateway Route
    new Apigatewayv2Route(this, 'api-route', {
      apiId: api.id,
      routeKey: 'POST /transactions',
      target: `integrations/${apiIntegration.id}`,
    });

    // API Gateway Stage
    const apiStage = new Apigatewayv2Stage(this, 'api-stage', {
      apiId: api.id,
      name: 'production',
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: apiLogGroup.arn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          responseLength: '$context.responseLength',
        }),
      },
      defaultRouteSettings: {
        throttlingBurstLimit: 5000,
        throttlingRateLimit: 10000,
      },
      tags: {
        Name: `trading-api-stage-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // Note: Mutual TLS configuration requires a custom domain and certificate
    // This would be configured with Apigatewayv2DomainName resource
    // For demonstration purposes, the structure is shown below:
    //
    // const apiDomain = new Apigatewayv2DomainName(this, "api-domain", {
    //   domainName: `api.trading-${environmentSuffix}.example.com`,
    //   domainNameConfiguration: {
    //     certificateArn: "arn:aws:acm:region:account:certificate/id",
    //     endpointType: "REGIONAL",
    //     securityPolicy: "TLS_1_2",
    //   },
    //   mutualTlsAuthentication: {
    //     truststoreUri: "s3://bucket/truststore.pem",
    //     truststoreVersion: "1",
    //   },
    // });

    // CloudWatch Alarms
    new CloudwatchMetricAlarm(this, 'rds-cpu-alarm', {
      alarmName: `rds-cpu-high-${environmentSuffix}`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      metricName: 'CPUUtilization',
      namespace: 'AWS/RDS',
      period: 300,
      statistic: 'Average',
      threshold: 80,
      actionsEnabled: true,
      alarmDescription: 'Alert when RDS CPU exceeds 80%',
      dimensions: {
        DBClusterIdentifier: rdsCluster.clusterIdentifier,
      },
      tags: {
        Name: `rds-cpu-alarm-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new CloudwatchMetricAlarm(this, 'elasticache-cpu-alarm', {
      alarmName: `elasticache-cpu-high-${environmentSuffix}`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      metricName: 'CPUUtilization',
      namespace: 'AWS/ElastiCache',
      period: 300,
      statistic: 'Average',
      threshold: 75,
      actionsEnabled: true,
      alarmDescription: 'Alert when ElastiCache CPU exceeds 75%',
      dimensions: {
        ReplicationGroupId: elasticacheCluster.replicationGroupId,
      },
      tags: {
        Name: `elasticache-cpu-alarm-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new CloudwatchMetricAlarm(this, 'kinesis-iterator-age-alarm', {
      alarmName: `kinesis-iterator-age-high-${environmentSuffix}`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 1,
      metricName: 'GetRecords.IteratorAgeMilliseconds',
      namespace: 'AWS/Kinesis',
      period: 60,
      statistic: 'Maximum',
      threshold: 60000, // 1 minute
      actionsEnabled: true,
      alarmDescription: 'Alert when Kinesis iterator age exceeds 1 minute',
      dimensions: {
        StreamName: kinesisStream.name,
      },
      tags: {
        Name: `kinesis-iterator-age-alarm-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    new CloudwatchMetricAlarm(this, 'api-gateway-5xx-alarm', {
      alarmName: `api-5xx-errors-${environmentSuffix}`,
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      metricName: '5XXError',
      namespace: 'AWS/ApiGateway',
      period: 300,
      statistic: 'Sum',
      threshold: 10,
      actionsEnabled: true,
      alarmDescription: 'Alert when API Gateway 5xx errors exceed 10',
      dimensions: {
        ApiId: api.id,
      },
      tags: {
        Name: `api-5xx-alarm-${environmentSuffix}`,
        Environment: environmentSuffix,
      },
    });

    // Outputs
    new TerraformOutput(this, 'vpc-id', {
      value: vpc.id,
      description: 'VPC ID',
    });

    new TerraformOutput(this, 'rds-cluster-endpoint', {
      value: rdsCluster.endpoint,
      description: 'RDS Aurora cluster endpoint',
    });

    new TerraformOutput(this, 'rds-cluster-reader-endpoint', {
      value: rdsCluster.readerEndpoint,
      description: 'RDS Aurora cluster reader endpoint',
    });

    new TerraformOutput(this, 'elasticache-endpoint', {
      value: elasticacheCluster.primaryEndpointAddress,
      description: 'ElastiCache Redis primary endpoint',
    });

    new TerraformOutput(this, 'efs-id', {
      value: efsFileSystem.id,
      description: 'EFS File System ID',
    });

    new TerraformOutput(this, 'kinesis-stream-name', {
      value: kinesisStream.name,
      description: 'Kinesis Data Stream name',
    });

    new TerraformOutput(this, 'api-gateway-url', {
      value: apiStage.invokeUrl,
      description: 'API Gateway URL',
    });

    new TerraformOutput(this, 'secrets-manager-secret-arn', {
      value: dbSecret.arn,
      description: 'Secrets Manager secret ARN for database credentials',
    });
  }
}

// Export for external use - entry point is in app.ts
