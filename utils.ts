import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { lstatSync, readdirSync } from 'fs';
import { join as pathJoin, sep as pathSep } from 'path';
import { PulumiUtil } from './index';
const mime = require('mime');

/***
 * Ensure path starts with a /
 * @param path
 */
export const ensureLeadingSlash = (path: string) => '/' + path.replace(/^\/+/, '');


/***
 * Ensure path ends with a /
 * @param path
 */
export const ensureTrailingSlash = (path: string) => path.replace(/\/+$/, '') + '/';

/***
 * Strip leading / from path
 * @param path
 */
export const stripLeadingSlash = (path: string) => path.replace(/^\/+/, '');

/***
 * Strip trailing / from path
 * @param path
 */
export const stripTrailingSlash = (path: string) => path.replace(/\/+$/, '');


/***
 * Ensure S3 prefix ends with a / and does not start with /
 * @param prefix
 */
export const normalizeS3Prefix = (prefix: string) =>
  stripLeadingSlash(ensureTrailingSlash(prefix));


/***
 * Ensure path uses / as separator and removes trailing slashes.
 * @param path Path to normalize.
 */
export const normalizePath = (path: string) =>
  stripTrailingSlash((pathSep !== '/' ? path.replace(/(\\+)/g, '/') : path));


/***
 * Returns an array of files under @dir.
 * @param dir Directory to search.
 * @param recursive Should search be recursive. Default true.
 * @param sortFiles Should returned array be sorted. Useful for hashing. Default true.
 * @param includePattern If provided only files matching RegExp will be returned.
 * @param excludePattern If provided files matching RegExp will be omitted.
 * @param depth Used internally to limit recursion to no more than 50 and optimize sort.
 */
export const folderFileList = (
  dir: string,
  recursive: boolean = true,
  sortFiles: boolean = true,
  includePattern: RegExp | null = null,
  excludePattern: RegExp | null = null,
  depth: number = 0
): string[] => {
  const itemOutputs: string[] = [];
  if (depth > 50) {
    throw new Error('Recursion limit of 50 exceeded!');
  }
  for (let item of readdirSync(dir)) {
    const filePath = normalizePath(pathJoin(dir, item));
    if (excludePattern && excludePattern.test(filePath)) {
      continue;
    }
    if (includePattern && !includePattern.test(filePath)) {
      continue;
    }
    if (recursive && lstatSync(filePath).isDirectory()) {
      const items = folderFileList(filePath, recursive, sortFiles, includePattern, excludePattern, depth + 1);
      itemOutputs.push(...items);
      continue;
    }
    itemOutputs.push(normalizePath(filePath));
  }
  // only sort files if requested and only at depth 0
  return sortFiles && depth === 0 ? itemOutputs.sort() : itemOutputs;
};

/***
 * Remap given path to a new path. Used to translate local path to bucket path.
 * @param dirBase Local filesystem path.
 * @param keyBase S3 Key to remap to.
 */
export const remapPathToS3 = (dirBase: string, keyBase: string) => {
  dirBase = normalizePath(dirBase);
  return folderFileList(dirBase)
    .map(normalizePath)
    .map(p => {
      return {path: p, key: p.replace(dirBase, keyBase)};
    });
};
/***
 * Recurse given folder and replicate structure in s3 starting at specified key.
 * @param dir Folder where all objects are located.
 * @param bucket S3 bucket for objects.
 * @param key S3 key prefix to put files. Defaults to no prefix.
 */
export const folderToS3 = (dir: string, bucket: aws.s3.Bucket, key: string = ''): aws.s3.BucketObject[] => {
  return remapPathToS3(dir, key).map(item => new aws.s3.BucketObject(
      item.key,
      {
        bucket: bucket,
        key: item.key,
        source: new pulumi.asset.FileAsset(item.path),
        contentType: mime.getType(item.path) || undefined
      },
      {provider: PulumiUtil.awsProvider}
    )
  );
};
