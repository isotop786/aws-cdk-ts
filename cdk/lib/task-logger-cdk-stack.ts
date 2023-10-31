////////////// AWS LAMBDA ////////////////////////
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2, aws_rds as rds, aws_lambda as lambda, CfnOutput, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import * as lambda_python_alpha from '@aws-cdk/aws-lambda-python-alpha';
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export class TaskLoggerCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a new VPC
    const vpc = new ec2.Vpc(this, 'TaskLoggerVpc', {
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
      ],
    });
    
    // Open port 80 and 22 in the security group
    const securityGroup = new ec2.SecurityGroup(this, 'TaskLoggerSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');

    // Create a new key pair
    const keyName = 'TaskLoggerKeyPair01';
    const keyPair = new ec2.CfnKeyPair(this, 'MyKeyPair', {
      keyName: 'TaskLoggerKeyPair01',
      publicKeyMaterial: fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_rsa.pub'), 'utf-8')
    });

    // Add user data to install required software
    const userScriptContent = fs.readFileSync('lib/user_data_db_endpoints.sh', 'utf-8');
    const userData = ec2.UserData.custom(userScriptContent);

    // Create an EC2 instance
    const instance = new ec2.Instance(this, 'TaskLoggerInstance', {
      instanceType: new ec2.InstanceType('t2.micro'),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      vpc,
      securityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      keyName,
      userDataCausesReplacement: true,
      userData,
    });

    // Create a static IP
    const eip = new ec2.CfnEIP(this, 'TaskLoggerInstanceIP');
    new ec2.CfnEIPAssociation(this, 'ElasticIpAssociation', {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });

    // Output the public IP address of the instance
    new CfnOutput(this, 'TaskLoggerInstancePublicIp', {
      value: instance.instancePublicIp,
      description: 'Public IP address of the EC2 instance',
    });

    // Output the instance ID
    new CfnOutput(this, 'TaskLoggerInstanceId', {
      value: instance.instanceId,
      description: 'ID of the EC2 instance',
    });

    // Create RDS instance
    const dbInstance = new rds.DatabaseInstance(this, "TaskLoggerDb", {
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_34
      }),
      databaseName: 'task_logger',
      multiAz: false,
      credentials: {
        username: 'root',
        password: SecretValue.unsafePlainText('password')
      },
      backupRetention: Duration.days(0),
      deleteAutomatedBackups: true,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
      publiclyAccessible: false,
    });
    
    dbInstance.connections.allowFrom(instance, ec2.Port.tcp(3306));
            
    // Add an AWS Lambda
    const taskLoggerLambda = new lambda_python_alpha.PythonFunction(this, 'TaskLoggerLambda', {
      runtime: lambda.Runtime.PYTHON_3_10,
      architecture: lambda.Architecture.X86_64,
      entry: './lib/lambda',
      index: 'task_logger.py',
      handler: 'lambda_handler',
      vpc: vpc,
      environment: {
        "DB_HOST": dbInstance.dbInstanceEndpointAddress,
        "DB_USER": "root",
        "DB_PSWD": "password",
        "DB_NAME": "task_logger",
      },
      timeout: Duration.seconds(30),
    });

    // Create a Function URL for the AWS Lambda and can be invoked by everyone
    const taskLoggerLambdaFunctionUrl = taskLoggerLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE
    });

    // Print out the Function URL
    new CfnOutput(this, 'TaskLoggerLambdaFunctionUrl', {
      value: taskLoggerLambdaFunctionUrl.url,
      description: 'Function URL for the AWS Lambda',
    });

    // Grant read/access to the RDS instance
    dbInstance.connections.allowFrom(taskLoggerLambda, ec2.Port.tcp(3306));
  }
}









/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import { aws_ec2 as ec2, aws_rds as rds } from 'aws-cdk-lib';
// import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
// import * as fs from 'fs'
// import * as os from 'os'
// import * as path from 'path'
// import * as iam from 'aws-cdk-lib/aws-iam'

// export class TaskLoggerCdkStack extends cdk.Stack {
//   constructor(scope: Construct, id: string, props?: cdk.StackProps) {
//     super(scope, id, props);

//     // Create a new VPC
//     const vpc = new ec2.Vpc(this, 'TaskLoggerVpc', {
//       subnetConfiguration: [
//         {
//           name: 'public-subnet',
//           subnetType: ec2.SubnetType.PUBLIC,
//           cidrMask: 24,
//         },
//         {
//           name: 'isolated-subnet',
//           subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
//           cidrMask: 28,
//         },
//       ],
//     });

//     // Create an IAM user
//     const user = new iam.User(this, 'root');

//     // Open port 80 and 22 in the security group
//     const securityGroup = new ec2.SecurityGroup(this, 'TaskLoggerSecurityGroup', {
//       vpc,
//       allowAllOutbound: true,

//     });
//     securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
//     securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');

//     // Create a new key pair
//     const keyName = 'TaskLoggerKeyPair01';
//     const keyPair = new ec2.CfnKeyPair(this, 'MyKeyPair', {
//       keyName: 'TaskLoggerKeyPair01',
//       publicKeyMaterial: fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_rsa.pub'), 'utf-8')
//     });

//     // Add user data to install required software
//     const userScriptContent = fs.readFileSync('lib/user_data_db_endpoints.sh', 'utf-8');
//     const userData = ec2.UserData.custom(userScriptContent);

//     // Create an EC2 instance
//     const instance = new ec2.Instance(this, 'TaskLoggerInstance', {
//       instanceType: new ec2.InstanceType('t3.micro'),
//       machineImage: ec2.MachineImage.latestAmazonLinux2023(),
//       vpc,
//       securityGroup,
//       vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
//       keyName,
//       userDataCausesReplacement: true,
//       userData,
//     });

//     //// SSH-2 RSA
    
//     // Create RDS instance
//     const dbInstance = new rds.DatabaseInstance(this, "TaskLoggerDb", {
//       vpc: vpc,
//       vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
//       instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
//       engine: rds.DatabaseInstanceEngine.mysql({
//         version: rds.MysqlEngineVersion.VER_8_0_34
//       }),
//       databaseName: 'task_logger',
//       multiAz: false,
//       credentials: {
//         username: 'root',
//         password: SecretValue.unsafePlainText('password')
//       },
//       backupRetention: Duration.days(0),
//       deleteAutomatedBackups: true,
//       deletionProtection: false,
//       removalPolicy: RemovalPolicy.DESTROY,
//       publiclyAccessible: false,
//     });
    
//     dbInstance.connections.allowFrom(instance, ec2.Port.tcp(3306));

//     // Create a static IP
//     const eip = new ec2.CfnEIP(this, 'TaskLoggerInstanceIP');
//     new ec2.CfnEIPAssociation(this, 'ElasticIpAssociation', {
//       eip: eip.ref,
//       instanceId: instance.instanceId,
//     });

//     // Output the public IP address of the instance
//     new CfnOutput(this, 'TaskLoggerInstancePublicIp', {
//       value: instance.instancePublicIp,
//       description: 'Public IP address of the EC2 instance',
//     });

//     // Output the instance ID
//     new CfnOutput(this, 'TaskLoggerInstanceId', {
//       value: instance.instanceId,
//       description: 'ID of the EC2 instance',
//     });
    
//     // Output the database endpoint address
//     new CfnOutput(this, 'TaskLoggerDbEndpointAddress', {
//       value: dbInstance.dbInstanceEndpointAddress,
//       description: 'Database endpoint addresss',
//     });
//   }
// }



////////////////////////////////////////////////////////////////////////////////////////
// import * as cdk from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// // import * as sqs from 'aws-cdk-lib/aws-sqs';
// import { aws_ec2 as ec2, CfnOutput, Stack } from 'aws-cdk-lib';
// import * as fs from 'fs'
// import * as os from 'os'
// import * as path from 'path'
// import * as rds from 'aws-cdk-lib/aws-rds';


// export class TaskLoggerCdkStack extends cdk.Stack {
//   constructor(scope: Construct, id: string, props?: cdk.StackProps) {
//     super(scope, id, props);

//     // Use the Default VPC
//     const vpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });

//     // Open port 80 and 22 in the security group
//     const securityGroup = new ec2.SecurityGroup(this, 'TaskLoggerSecurityGroup', {
//       vpc,
//       allowAllOutbound: true,
//     });

//     securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
//     securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');

//      // Create a new key pair
//      const keyName = 'TaskLoggerKeyPair';
//      const keyPair = new ec2.CfnKeyPair(this, 'MyKeyPair', {
//        keyName: 'TaskLoggerKeyPair',
//        publicKeyMaterial: fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_rsa.pub'), 'utf-8')
//      });


//       // Add user data to install required software
//     // const userScriptContent = fs.readFileSync('lib/user-data.sh', 'utf-8');
//     const userScriptContent = fs.readFileSync('lib/user-task-data.sh', 'utf-8');
//     const userData = ec2.UserData.custom(userScriptContent);


//         // Create an EC2 instance
//         const instance = new ec2.Instance(this, 'TaskLoggerInstance', {
//           instanceType: new ec2.InstanceType('t2.micro'),
//           machineImage: ec2.MachineImage.latestAmazonLinux2023(),
//           vpc,
//           securityGroup,
//           vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
//           keyName,
//           userDataCausesReplacement: true,
//           userData,
          
//         });


//         // Create a static IP
//     const eip = new ec2.CfnEIP(this, 'TaskLoggerInstanceIP');
//     new ec2.CfnEIPAssociation(this, 'ElasticIpAssociation', {
//       eip: eip.ref,
//       instanceId: instance.instanceId,
//     });


//     // Output the public IP address of the instance
//     new CfnOutput(this, 'TaskLoggerInstancePublicIp', {
//       value: instance.instancePublicIp,
//       description: 'Public IP address of the EC2 instance',
//     });


//     // Output the instance ID
//     new CfnOutput(this, 'TaskLoggerInstanceId', {
//       value: instance.instanceId,
//       description: 'ID of the EC2 instance',
//     });

//     // rds 
//     new rds.DatabaseCluster(this, 'Database', {
//       engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_15_2 }),
//       credentials: rds.Credentials.fromUsername('adminuser', { password: SecretValue.unsafePlainText('password') }),
//       instanceProps: {
//         instanceType: ec2.InstanceType.of(ec2.InstanceClass.X2G, ec2.InstanceSize.XLARGE),
//         vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
//         vpc,
//       },
//       storageType: rds.DBClusterStorageType.AURORA_IOPT1,
//     });
    


//     // EOL
//   }
// }


// // Amazon Aurora database
// // db name: database-1
// // user: admin
// // password: task_db_123