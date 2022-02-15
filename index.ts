import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { region } from '@pulumi/aws/config';
import { cloudfront } from '@pulumi/aws/types/input';
import { folderToS3 } from './utils';
import DistributionOrigin = cloudfront.DistributionOrigin;

export const cloudfrontZoneId = 'Z2FDTNDATAQYW2'; // well known zone id for cf

const REGION: any = 'us-west-2';
const frontendBucketFolderPrefix = '/frontend';
const cfLogOutputPrefix = 'logs/';
const hostedZoneName = 'localhost.localstack.cloud';
const siteDomainName = 'dp.localhost.localstack.cloud';


export class PulumiUtil {
  static awsProvider: any;
  static env: string;
}

PulumiUtil.awsProvider = new aws.Provider('localstack', {
  skipCredentialsValidation: true,
  skipMetadataApiCheck: true,
  skipRequestingAccountId: true,

  s3ForcePathStyle: true,
  accessKey: 'test',
  secretKey: 'test',
  region: REGION,
  endpoints: [{
    acm: 'http://localhost:4566',
    amplify: 'http://localhost:4566',
    apigateway: 'http://localhost:4566',
    apigatewayv2: 'http://localhost:4566',
    appconfig: 'http://localhost:4566',
    applicationautoscaling: 'http://localhost:4566',
    appsync: 'http://localhost:4566',
    athena: 'http://localhost:4566',
    backup: 'http://localhost:4566',
    batch: 'http://localhost:4566',
    cloudformation: 'http://localhost:4566',
    cloudfront: 'http://localhost:4566',
    cloudtrail: 'http://localhost:4566',
    cloudwatch: 'http://localhost:4566',
    cloudwatchlogs: 'http://localhost:4566',
    codecommit: 'http://localhost:4566',
    cognitoidentity: 'http://localhost:4566',
    cognitoidp: 'http://localhost:4566',
    docdb: 'http://localhost:4566',
    dynamodb: 'http://localhost:4566',
    dynamodbstreams: 'http://localhost:4566',
    ec2: 'http://localhost:4566',
    ecr: 'http://localhost:4566',
    ecs: 'http://localhost:4566',
    efs: 'http://localhost:4566',
    eks: 'http://localhost:4566',
    elasticache: 'http://localhost:4566',
    elasticbeanstalk: 'http://localhost:4566',
    elasticsearchservice: 'http://localhost:4566',
    elb: 'http://localhost:4566',
    elbv2: 'http://localhost:4566',
    emr: 'http://localhost:4566',
    eventbridge: 'http://localhost:4566',
    firehose: 'http://localhost:4566',
    glacier: 'http://localhost:4566',
    glue: 'http://localhost:4566',
    iam: 'http://localhost:4566',
    iot: 'http://localhost:4566',
    iotanalytics: 'http://localhost:4566',
    kafka: 'http://localhost:4566',
    kinesis: 'http://localhost:4566',
    kinesisanalytics: 'http://localhost:4566',
    kms: 'http://localhost:4566',
    lakeformation: 'http://localhost:4566',
    lambda: 'http://localhost:4566',
    mediastore: 'http://localhost:4566',
    neptune: 'http://localhost:4566',
    organizations: 'http://localhost:4566',
    qldb: 'http://localhost:4566',
    rds: 'http://localhost:4566',
    rdsdata: 'http://localhost:4566',
    redshift: 'http://localhost:4566',
    redshiftdata: 'http://localhost:4566',
    route53: 'http://localhost:4566',
    s3: 'http://localhost:4566',
    sagemaker: 'http://localhost:4566',
    secretsmanager: 'http://localhost:4566',
    ses: 'http://localhost:4566',
    sns: 'http://localhost:4566',
    sqs: 'http://localhost:4566',
    ssm: 'http://localhost:4566',
    stepfunctions: 'http://localhost:4566',
    sts: 'http://localhost:4566',
    timestreamquery: 'http://localhost:4566',
    timestreamwrite: 'http://localhost:4566',
    transfer: 'http://localhost:4566',
    xray: 'http://localhost:4566'
  }]
});


const stackPieces: string[] = pulumi.getStack().split('.');
PulumiUtil.env = stackPieces[stackPieces.length - 1];

export const siteZoneId = new aws.route53.Zone(
  'route53LocalZone',
  {
    name: hostedZoneName,
    forceDestroy: true
  },
  { provider: PulumiUtil.awsProvider }
).zoneId;

export const siteCert = new aws.acm.Certificate(
  'siteCert',
  {
    domainName: siteDomainName,
    validationMethod: 'DNS'
  },
  { provider: PulumiUtil.awsProvider }
);

// used to keep TS happy after the apply below
interface recordConvertValue {
  name: string;
  record: string;
  type: string;
}

// used to create DNS validation records for cert
// roughly based on the horribly broken example on pulumi's site
const domainValidationRecords = siteCert.domainValidationOptions.apply(
  o => {
    const dnsRecords: aws.route53.Record[] = [];
    for (const range of Object.entries(o.reduce((a, dvo) => {
        return {
          ...a, [dvo.domainName]: {
            name: dvo.resourceRecordName,
            record: dvo.resourceRecordValue,
            type: dvo.resourceRecordType
          }
        };
      }, {}))
      .map(([k, v]) => {
        return { key: k, value: v as recordConvertValue };
      })
      ) { // start of for loop body
      dnsRecords.push(
        new aws.route53.Record( // domain validation record
          `dvRecord-${range.key}`,
          {
            allowOverwrite: true,
            name: range.value.name,
            records: [range.value.record],
            ttl: 60,
            type: range.value.type,
            zoneId: siteZoneId
          },
          { provider: PulumiUtil.awsProvider }
        ) // new aws.route53.Record
      ); // dnsRecords.push
    } // end of for loop body
    return dnsRecords;
  } // end apply cbf
);

// validate cert using dns records created above
export const certificateValidation = new aws.acm.CertificateValidation(
  'certificateValidation',
  {
    certificateArn: siteCert.arn,
    validationRecordFqdns: domainValidationRecords.apply((recs: aws.route53.Record[]) => recs.map(record => record.fqdn))
  },
  { provider: PulumiUtil.awsProvider }
);


export const siteBucket = new aws.s3.Bucket(
  'frontend-bucket',
  {
    bucketPrefix: 'portal-',
    forceDestroy: true,
    versioning: {
      enabled: false
    },
    acl: 'private', // bucket is private
    // allow browser upload with signed url
    corsRules: [{
      allowedHeaders: ['*'],
      allowedMethods: ['PUT', 'POST'],
      allowedOrigins: [`https://${siteDomainName}`, 'http://localhost:4200'],
      exposeHeaders: ['ETag'],
      maxAgeSeconds: 3000
    }]
  },
  { provider: PulumiUtil.awsProvider }
);


// block all public access to bucket
export const siteBucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock(
  'siteBucketPublicAccessBlock',
  {
    bucket: siteBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true
  },
  {provider: PulumiUtil.awsProvider}
);

export const bucketItems = folderToS3('frontend', siteBucket, frontendBucketFolderPrefix);

// used to grant cf access to s3 bucket
export const oai = new aws.cloudfront.OriginAccessIdentity(
  'oai',
  {},
  { provider: PulumiUtil.awsProvider }
);


export const s3AllowCfPolicy = new aws.s3.BucketPolicy(
  's3AllowCfPolicy',
  {
    bucket: siteBucket.id,
    policy: {
      Version: '2012-10-17',
      Statement: [
        // serve the frontend
        {
          Action: 's3:GetObject',
          Effect: 'Allow',
          Resource: siteBucket.arn.apply(a => a + `${frontendBucketFolderPrefix}/*`), // append frontend folder prefix to bucket arn
          Principal: {
            AWS: oai.iamArn
          }
        },
        // write logs to logging folder
        {
          Action: 's3:PutObject',
          Effect: 'Allow',
          Resource: siteBucket.arn.apply(a => a + `/${cfLogOutputPrefix}*`), // append log folder prefix to bucket arn
          Principal: {
            Service: 'delivery.logs.amazonaws.com'
          }
        }
      ]
    }
  },
  { provider: PulumiUtil.awsProvider }
);

// origin to serve frontend
export const s3Origin: DistributionOrigin = {
  domainName: siteBucket.bucketRegionalDomainName,
  originId: 's3Origin',
  originPath: frontendBucketFolderPrefix,
  customHeaders: [],
  s3OriginConfig: {
    originAccessIdentity: oai.cloudfrontAccessIdentityPath
  },
  originShield: { // better caching
    enabled: true,
    originShieldRegion: region || ''
  }
};

// cloudfront distro that serves static frontend
export const cfDistribution = new aws.cloudfront.Distribution(
  'cfDistribution',
  {
    origins: [s3Origin],
    enabled: true,
    isIpv6Enabled: true,
    comment: 'portal',
    defaultRootObject: 'index.html', // serve index.html when url ends in /    THIS DOES NOT WORK
    loggingConfig: { // log to same bucket as frontend using logs/ prefix
      includeCookies: false,
      bucket: siteBucket.bucketRegionalDomainName,
      prefix: cfLogOutputPrefix
    },
    aliases: [siteDomainName],
    defaultCacheBehavior: {
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
      cachedMethods: ['GET', 'HEAD'],
      targetOriginId: s3Origin.originId,
      forwardedValues: {
        queryString: false,
        cookies: {
          forward: 'none'
        },
        headers: []
      },
      compress: true,
      viewerProtocolPolicy: 'redirect-to-https',
      minTtl: 1,
      defaultTtl: 86400,
      maxTtl: 31536000
    },
    orderedCacheBehaviors: [],
    priceClass: 'PriceClass_100', // US and Europe
    restrictions: {
      geoRestriction: {
        restrictionType: 'whitelist',
        locations: [
          'US', // USA
          'CA', // CANADA
          'GB', // UK
          'MT' // Malta
        ]
      }
    },
    viewerCertificate: {
      // cloudfrontDefaultCertificate: true,
      acmCertificateArn: siteCert.arn,
      minimumProtocolVersion: 'TLSv1.2_2021', // api-gw does not support higher than this
      sslSupportMethod: 'sni-only'
    },
    customErrorResponses: [ // allow virtual routes in SPA to get routed to index.html   THIS DOES NOT WORK
      {
        errorCode: 403,
        errorCachingMinTtl: 10,
        responseCode: 200,
        responsePagePath: '/index.html'
      },
      {
        errorCode: 404,
        errorCachingMinTtl: 10,
        responseCode: 200,
        responsePagePath: '/index.html'
      }
    ]
  },
  {
    provider: PulumiUtil.awsProvider
  }
);

// create alias record to point to cf distro
export const cfHostRecord = new aws.route53.Record(
  'cfHostRecord',
  {
    zoneId: siteZoneId,
    name: siteDomainName,
    type: 'A',
    aliases: [
      {
        evaluateTargetHealth: false,
        zoneId: cloudfrontZoneId,
        name: cfDistribution.domainName
      }
    ]
  },
  { provider: PulumiUtil.awsProvider }
);

